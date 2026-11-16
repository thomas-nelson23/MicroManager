/**
 * The USB device on this computer: choosing the port, flashing builds and sending display commands.
 * One operation at a time. The display always goes through Web Serial (the sketch's NexPass); sketches
 * go to a Nano Every over Web Serial (UPDI) and to a Teensy over WebHID (its HalfKay bootloader).
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  decodeReply,
  flashNanoEvery,
  flashTeensy,
  openDisplay,
  parseIntelHex,
  resetBoard,
  sleep,
  TEENSY_VID,
  teensyEnterBootloader,
  teensyRestart,
  type DisplayInfo,
  type SerialTransport,
} from "@nextion-arduino/flasher";
import { WebSerialTransport } from "@nextion-arduino/flasher/web";
import { WebHidHalfKay } from "@nextion-arduino/flasher/web-hid";

/** How the current project's board is flashed (from its FQBN). */
export type BoardKind = "nano-every" | "teensy";
export const boardKind = (fqbn: string): BoardKind => (fqbn.startsWith("teensy:") ? "teensy" : "nano-every");

export interface FlashJob {
  sketchUrl?: string;
  screenUrl?: string;
  expectModel?: string;
}

export interface Progress {
  label: string;
  done?: number;
  total?: number;
}

export interface CommandResult {
  cmd: string;
  reply: unknown[];
}

interface Device {
  supported: boolean;
  /** The page was opened over plain HTTP, where browsers don't offer USB access at all. */
  insecure: boolean;
  /** USB ids of the chosen serial port, to recognise the board. */
  usb: { vendorId?: number; productId?: number } | null;
  portLabel: string | null;
  display: DisplayInfo | null;
  busy: Progress | null;
  board: BoardKind;
  /** The Teensy is waiting in its bootloader for the person to allow it (WebHID needs a click). */
  bootloaderPrompt: boolean;
  setBoard(kind: BoardKind): void;
  choosePort(): Promise<boolean>;
  /** Choose the port if none is chosen yet. False if flashing can't go ahead. */
  ensurePort(): Promise<boolean>;
  allowBootloader(): Promise<void>;
  cancelBootloader(): void;
  flash(job: FlashJob): Promise<{ status: "done" | "failed"; message: string }>;
  run(commands: string[], listenSeconds?: number): Promise<{ results: CommandResult[]; events: unknown[] }>;
}

const Ctx = createContext<Device | null>(null);
export const useDevice = () => useContext(Ctx)!;

const SERIAL_FILTERS: SerialPortFilter[] = [
  { usbVendorId: 0x2341 },
  { usbVendorId: 0x2a03 },
  { usbVendorId: 0x1a86 },
  { usbVendorId: 0x0403 },
  { usbVendorId: 0x10c4 },
  { usbVendorId: TEENSY_VID },
];

const isTeensyPort = (p: SerialPort) => p.getInfo().usbVendorId === TEENSY_VID;

function label(p: SerialPort): string {
  const i = p.getInfo();
  if (i.usbVendorId === 0x2341 && i.usbProductId === 0x0058) return "Arduino Nano Every";
  if (i.usbVendorId === 0x2341) return "Arduino";
  if (i.usbVendorId === TEENSY_VID) return "Teensy";
  return i.usbVendorId ? `USB ${i.usbVendorId.toString(16)}:${i.usbProductId?.toString(16)}` : "Serial port";
}

/** Wait for a Teensy's USB serial to come back after a reboot (it is a new port each time). */
function waitForTeensyPort(ms: number): Promise<SerialPort | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (p: SerialPort | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      navigator.serial.removeEventListener("connect", onConnect);
      resolve(p);
    };
    const onConnect = (e: Event) => {
      const p = e.target as SerialPort;
      if (isTeensyPort(p)) finish(p);
    };
    navigator.serial.addEventListener("connect", onConnect);
    // Chrome may also hand back the same object; poll once the old one has had time to go away.
    const started = Date.now();
    const poll = setInterval(async () => {
      if (Date.now() - started < 1500) return;
      const p = (await navigator.serial.getPorts()).find((x) => isTeensyPort(x) && x.connected !== false);
      if (p) finish(p);
    }, 300);
    const timer = setTimeout(() => finish(null), ms);
  });
}

export function DeviceProvider({ children }: { children: ReactNode }) {
  const supported = typeof navigator !== "undefined" && "serial" in navigator;
  const insecure = typeof window !== "undefined" && !window.isSecureContext;
  const [transport, setTransport] = useState<WebSerialTransport | null>(null);
  const [display, setDisplay] = useState<DisplayInfo | null>(null);
  const [busy, setBusy] = useState<Progress | null>(null);
  const [board, setBoardState] = useState<BoardKind>("nano-every");
  const [bootloaderPrompt, setBootloaderPrompt] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const tRef = useRef<WebSerialTransport | null>(null);
  tRef.current = transport;
  const boardRef = useRef<BoardKind>(board);
  boardRef.current = board;
  /** A Teensy reboot is in progress: its port disappearing is expected. */
  const rebooting = useRef(false);
  const promptRef = useRef<((hk: WebHidHalfKay | null) => void) | null>(null);

  useEffect(() => {
    if (!supported) return;
    navigator.serial.getPorts().then((ports) => {
      if (ports[0] && !tRef.current) setTransport(new WebSerialTransport(ports[0]));
    });
    const onDisconnect = (e: Event) => {
      if (rebooting.current) return;
      if (tRef.current && (e.target as SerialPort) === tRef.current.port) {
        setTransport(null);
        setDisplay(null);
      }
    };
    // A Teensy plugged back in (or rebooted outside an operation) is a new port: adopt it.
    const onConnect = (e: Event) => {
      const p = e.target as SerialPort;
      if (!rebooting.current && !tRef.current && isTeensyPort(p)) setTransport(new WebSerialTransport(p));
    };
    navigator.serial.addEventListener("disconnect", onDisconnect);
    navigator.serial.addEventListener("connect", onConnect);
    return () => {
      navigator.serial.removeEventListener("disconnect", onDisconnect);
      navigator.serial.removeEventListener("connect", onConnect);
    };
  }, [supported]);

  /** Run one device operation at a time; the serial port is always left closed afterwards. */
  const exclusive = useCallback(<T,>(fn: (t: WebSerialTransport | null) => Promise<T>, needPort = true): Promise<T> => {
    const run = async () => {
      const t = tRef.current;
      if (!t && needPort) throw new Error("No device connected. Choose the board's port first.");
      try {
        return await fn(t);
      } finally {
        await t?.close().catch(() => {});
        rebooting.current = false;
        setBusy(null);
      }
    };
    const p = queue.current.then(run, run);
    queue.current = p.catch(() => {});
    return p;
  }, []);

  /** After a Teensy reboot, point the transport at its new port (or create one). */
  const rebindTeensy = useCallback(async (t: WebSerialTransport | null): Promise<WebSerialTransport | null> => {
    const p = await waitForTeensyPort(8000);
    if (!p) return null;
    if (t) {
      await t.close().catch(() => {});
      t.rebind(p);
      setTransport(t);
      return t;
    }
    const nt = new WebSerialTransport(p);
    setTransport(nt);
    return nt;
  }, []);

  const restartFor = useCallback(
    (kind: BoardKind) =>
      async (port: SerialTransport): Promise<void> => {
        if (kind === "nano-every") return resetBoard(port);
        rebooting.current = true;
        await teensyRestart(port);
        if (port instanceof WebSerialTransport) await rebindTeensy(port);
        rebooting.current = false;
        await sleep(1000); // let the sketch open the display port
      },
    [rebindTeensy],
  );

  const choosePort = useCallback(async () => {
    if (!supported) return false;
    try {
      const t = await WebSerialTransport.request(SERIAL_FILTERS);
      if (tRef.current?.isOpen) await tRef.current.close();
      setTransport(t);
      setDisplay(null);
      return true;
    } catch {
      return false; // picker cancelled
    }
  }, [supported]);

  // A Teensy can be flashed without a serial port (blank board, or one held in its bootloader).
  const ensurePort = useCallback(async () => !!tRef.current || (await choosePort()) || boardRef.current === "teensy", [choosePort]);

  const allowBootloader = useCallback(async () => {
    let hk: WebHidHalfKay | null = null;
    try {
      hk = await WebHidHalfKay.request();
    } catch {
      hk = null;
    }
    setBootloaderPrompt(false);
    promptRef.current?.(hk);
    promptRef.current = null;
  }, []);

  const cancelBootloader = useCallback(() => {
    setBootloaderPrompt(false);
    promptRef.current?.(null);
    promptRef.current = null;
  }, []);

  /** Get the Teensy into HalfKay and return it, asking the person to allow it the first time. */
  const halfKay = useCallback(async (t: WebSerialTransport | null): Promise<WebHidHalfKay> => {
    if (!("hid" in navigator)) throw new Error("this browser has no WebHID, which flashing a Teensy needs. Use Chrome or Edge.");
    let hk = await WebHidHalfKay.find();
    if (!hk && t) {
      setBusy({ label: "Restarting the Teensy into its bootloader" });
      rebooting.current = true;
      await teensyEnterBootloader(t).catch(() => {});
      hk = await WebHidHalfKay.waitFor(4000);
    }
    if (!hk) {
      // Either this page hasn't been allowed to use the bootloader yet, or the sketch didn't reboot.
      setBusy({ label: "Waiting for you to allow the Teensy bootloader" });
      hk = await new Promise<WebHidHalfKay | null>((resolve) => {
        promptRef.current = resolve;
        setBootloaderPrompt(true);
      });
      if (!hk) throw new Error("the Teensy bootloader wasn't allowed. If it doesn't show up in the list, press the button on the Teensy and try again");
    }
    return hk;
  }, []);

  const flash = useCallback(
    (job: FlashJob) =>
      exclusive(async (t0) => {
        let t = t0;
        const kind = boardRef.current;
        try {
          if (job.sketchUrl) {
            setBusy({ label: "Downloading sketch" });
            const r = await fetch(job.sketchUrl);
            if (!r.ok) throw new Error("couldn't download the sketch");
            const img = parseIntelHex(await r.text());
            const progress = (p: { stage: string; done?: number; total?: number }) =>
              setBusy({
                label: p.stage === "write" ? "Writing sketch" : p.stage === "verify" ? "Verifying sketch" : p.stage === "erase" ? "Erasing flash" : `Sketch: ${p.stage}`,
                done: p.done,
                total: p.total,
              });
            if (kind === "teensy") {
              const hk = await halfKay(t);
              await hk.open();
              try {
                await flashTeensy(hk, img, progress);
              } finally {
                await hk.close();
              }
              setBusy({ label: "Waiting for the sketch to start" });
              rebooting.current = true;
              t = await rebindTeensy(t);
              rebooting.current = false;
              if (!t && job.screenUrl) throw new Error("the sketch is flashed, but its USB serial port didn't come back, so the screen wasn't uploaded");
              await sleep(1000);
            } else {
              if (!t) throw new Error("No device connected. Choose the board's port first.");
              await flashNanoEvery(t, img, progress);
              await sleep(1500); // let the sketch boot
            }
          }
          if (job.screenUrl) {
            if (!t) throw new Error("No device connected. Choose the board's port first.");
            setBusy({ label: "Downloading screen" });
            const r = await fetch(job.screenUrl);
            if (!r.ok) throw new Error("couldn't download the screen");
            const tft = new Uint8Array(await r.arrayBuffer());
            setBusy({ label: "Connecting to the display" });
            const { nex, info } = await openDisplay(t, 115200, restartFor(kind));
            setDisplay(info);
            if (job.expectModel && !info.model.startsWith(job.expectModel)) {
              throw new Error(`the display is a ${info.model}, but this project is built for ${job.expectModel}`);
            }
            await nex.uploadTft(tft, { progress: (p) => setBusy({ label: "Uploading screen", done: p.done, total: p.total }) });
            setBusy({ label: "Restarting the board" });
            if (kind === "teensy") await restartFor(kind)(t);
            else {
              await t.close();
              await resetBoard(t);
            }
          }
          const parts = [job.sketchUrl && "sketch", job.screenUrl && "screen"].filter(Boolean).join(" and ");
          return { status: "done" as const, message: `${parts} flashed` };
        } catch (e) {
          return { status: "failed" as const, message: e instanceof Error ? e.message : String(e) };
        }
      }, boardRef.current !== "teensy" || !!job.screenUrl),
    [exclusive, halfKay, rebindTeensy, restartFor],
  );

  const run = useCallback(
    (commands: string[], listenSeconds = 0) =>
      exclusive(async (t) => {
        setBusy({ label: "Talking to the display" });
        const { nex, info } = await openDisplay(t!, 115200, restartFor(boardRef.current));
        setDisplay(info);
        await nex.command("bkcmd=3");
        const results: CommandResult[] = [];
        for (const cmd of commands) results.push({ cmd, reply: await nex.command(cmd) });
        let events: unknown[] = [];
        if (listenSeconds > 0) {
          setBusy({ label: `Listening for ${listenSeconds} s` });
          t!.rx.clear();
          const msgs = await nex.collect(listenSeconds * 1000);
          events = msgs.map(decodeReply);
        }
        return { results, events };
      }),
    [exclusive, restartFor],
  );

  const setBoard = useCallback((kind: BoardKind) => setBoardState(kind), []);

  const value = useMemo<Device>(
    () => ({
      supported,
      insecure,
      usb: transport ? { vendorId: transport.port.getInfo().usbVendorId, productId: transport.port.getInfo().usbProductId } : null,
      portLabel: transport ? label(transport.port) : null,
      display,
      busy,
      board,
      bootloaderPrompt,
      setBoard,
      choosePort,
      ensurePort,
      allowBootloader,
      cancelBootloader,
      flash,
      run,
    }),
    [supported, insecure, transport, display, busy, board, bootloaderPrompt, setBoard, choosePort, ensurePort, allowBootloader, cancelBootloader, flash, run],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
