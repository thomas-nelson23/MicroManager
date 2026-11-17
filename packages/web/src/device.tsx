/**
 * The USB device on this computer: choosing the port, flashing builds and sending display commands.
 * One operation at a time. The display always goes through Web Serial (the sketch's NexPass); sketches
 * go to a Nano Every over Web Serial (UPDI), to a Teensy over WebHID (its HalfKay bootloader) and to an
 * RP2040 as a UF2 file copied onto its BOOTSEL drive (File System Access).
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  decodeReply,
  flashNanoEvery,
  flashTeensy,
  openDisplay,
  checkUf2,
  parseIntelHex,
  resetBoard,
  RP2040_VIDS,
  rp2040EnterBootloader,
  sleep,
  TEENSY_VID,
  teensyEnterBootloader,
  teensyRestart,
  type DisplayInfo,
  type Nextion,
  type NexReply,
  type SerialTransport,
} from "@nextion-arduino/flasher";
import { WebSerialTransport } from "@nextion-arduino/flasher/web";
import { WebHidHalfKay } from "@nextion-arduino/flasher/web-hid";
import { canWriteDrives, Uf2Drive } from "@nextion-arduino/flasher/web-uf2";

/** How the current project's board is flashed (from its FQBN). */
export type BoardKind = "nano-every" | "teensy" | "rp2040";
export const boardKind = (fqbn: string): BoardKind => (fqbn.startsWith("teensy:") ? "teensy" : fqbn.startsWith("rp2040:") ? "rp2040" : "nano-every");

/** The flash is waiting for a click: to allow the Teensy bootloader, or to pick the Pico's drive (with the .uf2 to copy by hand instead). */
export type BootloaderPrompt = { kind: "teensy" } | { kind: "rp2040"; fileUrl: string };
type DriveChoice = Uf2Drive | "manual" | Error | null;

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

/** One line of the device console. */
export interface LogEntry {
  n: number;
  at: number;
  /** out: we sent it; in: the display or sketch sent it; note: something about the connection. */
  dir: "out" | "in" | "note";
  text?: string;
  reply?: NexReply;
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
  /** The board is waiting in its bootloader for the person (WebHID and drive access need a click). */
  bootloaderPrompt: BootloaderPrompt | null;
  setBoard(kind: BoardKind): void;
  choosePort(): Promise<boolean>;
  /** Choose the port if none is chosen yet. False if flashing can't go ahead. */
  ensurePort(): Promise<boolean>;
  allowBootloader(): Promise<void>;
  /** The person copied the .uf2 onto the drive themselves. */
  copiedByHand(): void;
  cancelBootloader(): void;
  flash(job: FlashJob): Promise<{ status: "done" | "failed"; message: string }>;
  run(commands: string[], listenSeconds?: number): Promise<{ results: CommandResult[]; events: unknown[] }>;
  /** Keep the port open between operations and show everything the device sends in the console. */
  live: boolean;
  setLive(on: boolean): void;
  log: LogEntry[];
  clearLog(): void;
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
  ...RP2040_VIDS.map((usbVendorId) => ({ usbVendorId })),
];

/** Boards whose USB serial is part of the sketch, so it is a new port after every reboot. */
const isRebootingPort = (p: SerialPort) => [TEENSY_VID, ...RP2040_VIDS].includes(p.getInfo().usbVendorId ?? -1);
const vidsFor = (kind: BoardKind) => (kind === "rp2040" ? RP2040_VIDS : [TEENSY_VID]);

function label(p: SerialPort): string {
  const i = p.getInfo();
  if (i.usbVendorId === 0x2341 && i.usbProductId === 0x0058) return "Arduino Nano Every";
  if (i.usbVendorId === 0x2341) return "Arduino";
  if (i.usbVendorId === TEENSY_VID) return "Teensy";
  if (i.usbVendorId === 0x2e8a) return "Raspberry Pi Pico";
  if (i.usbVendorId === 0x239a) return "Adafruit RP2040";
  return i.usbVendorId ? `USB ${i.usbVendorId.toString(16)}:${i.usbProductId?.toString(16)}` : "Serial port";
}

/** Wait for a Teensy's or Pico's USB serial to come back after a reboot (it is a new port each time). */
function waitForBoardPort(vids: number[], ms: number): Promise<SerialPort | null> {
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
      if (vids.includes(p.getInfo().usbVendorId ?? -1)) finish(p);
    };
    navigator.serial.addEventListener("connect", onConnect);
    // Chrome may also hand back the same object; poll once the old one has had time to go away.
    const started = Date.now();
    const poll = setInterval(async () => {
      if (Date.now() - started < 1500) return;
      const p = (await navigator.serial.getPorts()).find((x) => vids.includes(x.getInfo().usbVendorId ?? -1) && x.connected !== false);
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
  const [bootloaderPrompt, setBootloaderPrompt] = useState<BootloaderPrompt | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const tRef = useRef<WebSerialTransport | null>(null);
  tRef.current = transport;
  const boardRef = useRef<BoardKind>(board);
  boardRef.current = board;
  /** A Teensy or Pico reboot is in progress: its port disappearing is expected. */
  const rebooting = useRef(false);
  const promptRef = useRef<((hk: WebHidHalfKay | null) => void) | null>(null);
  const drivePromptRef = useRef<((d: DriveChoice) => void) | null>(null);
  /** The open, handshaken display connection, reused while the port stays open (live mode). */
  const session = useRef<{ nex: Nextion; info: DisplayInfo } | null>(null);
  const [live, setLiveState] = useState(false);
  const liveRef = useRef(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logN = useRef(0);
  const addLog = useCallback((entries: Omit<LogEntry, "n" | "at">[]) => {
    if (!entries.length) return;
    const at = Date.now();
    setLog((l) => [...l, ...entries.map((e) => ({ ...e, n: ++logN.current, at }))].slice(-400));
  }, []);
  const pending = useRef(0);

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
    // A Teensy or Pico plugged back in (or rebooted outside an operation) is a new port: adopt it.
    const onConnect = (e: Event) => {
      const p = e.target as SerialPort;
      if (!rebooting.current && !tRef.current && isRebootingPort(p)) setTransport(new WebSerialTransport(p));
    };
    navigator.serial.addEventListener("disconnect", onDisconnect);
    navigator.serial.addEventListener("connect", onConnect);
    return () => {
      navigator.serial.removeEventListener("disconnect", onDisconnect);
      navigator.serial.removeEventListener("connect", onConnect);
    };
  }, [supported]);

  /** Run one device operation at a time; the serial port is always left closed afterwards. */
  const exclusive = useCallback(<T,>(fn: (t: WebSerialTransport | null) => Promise<T>, needPort = true, mayStayOpen = true): Promise<T> => {
    pending.current++;
    const run = async () => {
      const t = tRef.current;
      if (!t && needPort) throw new Error("No device connected. Choose the board's port first.");
      let ok = false;
      try {
        const r = await fn(t);
        ok = true;
        return r;
      } finally {
        pending.current--;
        // In live mode the port stays open after a display operation that went well.
        if (!(liveRef.current && mayStayOpen && ok && t?.isOpen && session.current)) {
          session.current = null;
          await t?.close().catch(() => {});
        }
        rebooting.current = false;
        setBusy(null);
      }
    };
    const p = queue.current.then(run, run);
    queue.current = p.catch(() => {});
    return p;
  }, []);

  /** After a Teensy or Pico reboot, point the transport at its new port (or create one). */
  const rebindPort = useCallback(async (t: WebSerialTransport | null, vids: number[]): Promise<WebSerialTransport | null> => {
    const p = await waitForBoardPort(vids, 8000);
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
        // Teensy and RP2040: NexPass reboots the board when DTR drops after a TFT upload.
        rebooting.current = true;
        await teensyRestart(port);
        if (port instanceof WebSerialTransport) await rebindPort(port, vidsFor(kind));
        rebooting.current = false;
        await sleep(1000); // let the sketch open the display port
      },
    [rebindPort],
  );

  /** The display connection: reused when the port is still open, otherwise opened with a handshake. */
  const connect = useCallback(
    async (t: WebSerialTransport) => {
      if (session.current && t.isOpen) return session.current;
      session.current = null;
      const s = await openDisplay(t, 115200, restartFor(boardRef.current));
      setDisplay(s.info);
      await s.nex.command("bkcmd=3");
      session.current = s;
      addLog([{ dir: "note", text: `connected to ${s.info.model}` }]);
      return s;
    },
    [addLog, restartFor],
  );

  const choosePort = useCallback(async () => {
    if (!supported) return false;
    try {
      const t = await WebSerialTransport.request(SERIAL_FILTERS);
      session.current = null;
      if (tRef.current?.isOpen) await tRef.current.close();
      setTransport(t);
      setDisplay(null);
      return true;
    } catch {
      return false; // picker cancelled
    }
  }, [supported]);

  // A Teensy or Pico can be flashed without a serial port (blank board, or one held in its bootloader).
  const ensurePort = useCallback(async () => !!tRef.current || (await choosePort()) || boardRef.current !== "nano-every", [choosePort]);

  const answerDrive = useCallback((d: DriveChoice) => {
    setBootloaderPrompt(null);
    drivePromptRef.current?.(d);
    drivePromptRef.current = null;
  }, []);

  const allowBootloader = useCallback(async () => {
    if (drivePromptRef.current) {
      answerDrive(await Uf2Drive.pick().catch((e: unknown) => (e instanceof DOMException && e.name === "AbortError" ? null : e instanceof Error ? e : new Error(String(e)))));
      return;
    }
    let hk: WebHidHalfKay | null = null;
    try {
      hk = await WebHidHalfKay.request();
    } catch {
      hk = null;
    }
    setBootloaderPrompt(null);
    promptRef.current?.(hk);
    promptRef.current = null;
  }, [answerDrive]);

  const copiedByHand = useCallback(() => answerDrive("manual"), [answerDrive]);

  const cancelBootloader = useCallback(() => {
    setBootloaderPrompt(null);
    promptRef.current?.(null);
    promptRef.current = null;
    drivePromptRef.current?.(null);
    drivePromptRef.current = null;
  }, []);

  /** Get the Teensy into HalfKay and return it, asking the person to allow it the first time. */
  const halfKay = useCallback(async (t: WebSerialTransport | null): Promise<WebHidHalfKay> => {
    if (!("hid" in navigator)) throw new Error("this browser has no WebHID, which flashing a Teensy needs. Use Chrome or Edge.");
    let hk = await WebHidHalfKay.find();
    if (!hk && t) {
      setBusy({ label: "Restarting the Teensy into its bootloader" });
      rebooting.current = true;
      await teensyEnterBootloader(t).catch(() => {});
      // HalfKay enumerates about a second after the reboot. One already allowed shows up here.
      hk = await WebHidHalfKay.waitFor(1500);
    }
    if (!hk && navigator.userActivation?.isActive) {
      // Still inside the person's click: open Chrome's device chooser straight away. It lists
      // HalfKay as soon as it enumerates, so this is a single pick, no second button.
      setBusy({ label: "Pick “Teensy HalfKay” in the list Chrome shows" });
      hk = await WebHidHalfKay.request().catch(() => null);
    }
    if (!hk) {
      // Either this page hasn't been allowed to use the bootloader yet, or the sketch didn't reboot.
      setBusy({ label: "Waiting for you to allow the Teensy bootloader" });
      hk = await new Promise<WebHidHalfKay | null>((resolve) => {
        promptRef.current = resolve;
        setBootloaderPrompt({ kind: "teensy" });
      });
      if (!hk) throw new Error("the Teensy bootloader wasn't allowed. If it doesn't show up in the list, press the button on the Teensy and try again");
    }
    return hk;
  }, []);

  /** Get the Pico into BOOTSEL and copy the UF2 onto its drive, asking the person to pick the drive when needed. */
  const flashPico = useCallback(async (t: WebSerialTransport | null, uf2: Uint8Array, fileUrl: string) => {
    if (t) {
      setBusy({ label: "Restarting the board into BOOTSEL" });
      rebooting.current = true;
      await rp2040EnterBootloader(t).catch(() => {});
    }
    let choice: DriveChoice = null;
    if (canWriteDrives()) {
      setBusy({ label: "Waiting for the RPI-RP2 drive" });
      choice = await Uf2Drive.remembered(t ? 8000 : 1500);
    }
    if (!choice) {
      setBusy({ label: "Waiting for you to choose the RPI-RP2 drive" });
      choice = await new Promise<DriveChoice>((resolve) => {
        drivePromptRef.current = resolve;
        setBootloaderPrompt({ kind: "rp2040", fileUrl });
      });
    }
    if (choice instanceof Error) throw choice;
    if (!choice) throw new Error("the RPI-RP2 drive wasn't chosen. If it doesn't show up, hold the board's BOOT (BOOTSEL) button while plugging it in or pressing reset, and try again");
    if (choice !== "manual") {
      setBusy({ label: "Copying the sketch to the board" });
      await choice.write(uf2);
    }
  }, []);

  const flash = useCallback(
    (job: FlashJob) =>
      exclusive(async (t0) => {
        session.current = null; // flashing reopens the port its own way
        if (t0?.isOpen) await t0.close();
        let t = t0;
        const kind = boardRef.current;
        try {
          if (job.sketchUrl) {
            // While still inside the Flash click, renew access to the Pico drive picked on an earlier visit.
            if (kind === "rp2040" && navigator.userActivation?.isActive) await Uf2Drive.renew();
            setBusy({ label: "Downloading sketch" });
            const r = await fetch(job.sketchUrl);
            if (!r.ok) throw new Error("couldn't download the sketch");
            const bytes = new Uint8Array(await r.arrayBuffer());
            const progress = (p: { stage: string; done?: number; total?: number }) =>
              setBusy({
                label: p.stage === "write" ? "Writing sketch" : p.stage === "verify" ? "Verifying sketch" : p.stage === "erase" ? "Erasing flash" : `Sketch: ${p.stage}`,
                done: p.done,
                total: p.total,
              });
            if (kind === "rp2040") {
              checkUf2(bytes);
              await flashPico(t, bytes, job.sketchUrl);
              setBusy({ label: "Waiting for the sketch to start" });
              rebooting.current = true;
              t = await rebindPort(t, RP2040_VIDS);
              rebooting.current = false;
              if (!t && job.screenUrl) throw new Error("the sketch was copied to the board, but its USB serial port didn't come back, so the screen wasn't uploaded");
              await sleep(1000);
            } else if (kind === "teensy") {
              const img = parseIntelHex(new TextDecoder().decode(bytes));
              const hk = await halfKay(t);
              await hk.open();
              try {
                await flashTeensy(hk, img, progress);
              } finally {
                await hk.close();
              }
              setBusy({ label: "Waiting for the sketch to start" });
              rebooting.current = true;
              t = await rebindPort(t, [TEENSY_VID]);
              rebooting.current = false;
              if (!t && job.screenUrl) throw new Error("the sketch is flashed, but its USB serial port didn't come back, so the screen wasn't uploaded");
              await sleep(1000);
            } else {
              if (!t) throw new Error("No device connected. Choose the board's port first.");
              await flashNanoEvery(t, parseIntelHex(new TextDecoder().decode(bytes)), progress);
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
            if (kind !== "nano-every") await restartFor(kind)(t);
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
      }, boardRef.current === "nano-every" || !!job.screenUrl, false),
    [exclusive, halfKay, flashPico, rebindPort, restartFor],
  );

  const listen = useCallback(
    async (nex: Nextion, t: WebSerialTransport, seconds: number) => {
      if (seconds <= 0) return [];
      setBusy({ label: `Listening for ${seconds} s` });
      t.rx.clear();
      const replies = (await nex.collect(seconds * 1000)).map(decodeReply);
      addLog(replies.map((reply) => ({ dir: "in" as const, reply })));
      return replies;
    },
    [addLog],
  );

  const run = useCallback(
    (commands: string[], listenSeconds = 0) =>
      exclusive(async (t) => {
        setBusy({ label: "Talking to the display" });
        const { nex } = await connect(t!);
        const results: CommandResult[] = [];
        for (const cmd of commands) {
          addLog([{ dir: "out", text: cmd }]);
          if (cmd.startsWith("@")) {
            // a request for the sketch (NexPass.onRequest), not for the display
            try {
              const r = await nex.ask(cmd.slice(1));
              const reply = [...r.lines.map((l) => ({ sketch: l })), ...r.other];
              results.push({ cmd, reply });
              addLog(reply.map((x) => ({ dir: "in" as const, reply: x })));
            } catch (e) {
              const error = e instanceof Error ? e.message : String(e);
              results.push({ cmd, reply: [{ error }] });
              addLog([{ dir: "note", text: error }]);
            }
            continue;
          }
          const reply = await nex.command(cmd);
          results.push({ cmd, reply });
          addLog(reply.map((r) => ({ dir: "in" as const, reply: r })));
        }
        const events = await listen(nex, t!, listenSeconds);
        return { results, events };
      }),
    [exclusive, connect, listen, addLog],
  );

  // Live mode: while nothing else is queued, read whatever the device sends and log it.
  const pumping = useRef(false);
  const pump = useCallback(() => {
    if (pumping.current || !liveRef.current || pending.current > 0 || !tRef.current) return;
    pumping.current = true;
    exclusive(async (t) => {
      const { nex } = await connect(t!);
      const msgs = await nex.collect(250);
      addLog(msgs.map((m) => ({ dir: "in" as const, reply: decodeReply(m) })));
    }).then(
      () => {
        pumping.current = false;
        setTimeout(pump, 0);
      },
      (e: unknown) => {
        pumping.current = false;
        liveRef.current = false;
        setLiveState(false);
        addLog([{ dir: "note", text: `live connection stopped: ${e instanceof Error ? e.message : String(e)}` }]);
      },
    );
  }, [exclusive, connect, addLog]);

  const setLive = useCallback(
    (on: boolean) => {
      liveRef.current = on;
      setLiveState(on);
      if (on) pump();
      else
        // close the port once whatever is running finishes
        exclusive(async () => {}, false, false).catch(() => {});
    },
    [pump, exclusive],
  );

  // Pick the pump back up after other operations (they hold the queue while they run).
  useEffect(() => {
    if (!live) return;
    const i = setInterval(pump, 1000);
    return () => clearInterval(i);
  }, [live, pump]);

  const clearLog = useCallback(() => setLog([]), []);

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
      copiedByHand,
      cancelBootloader,
      flash,
      run,
      live,
      setLive,
      log,
      clearLog,
    }),
    [supported, insecure, transport, display, busy, board, bootloaderPrompt, setBoard, choosePort, ensurePort, allowBootloader, copiedByHand, cancelBootloader, flash, run, live, setLive, log, clearLog],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
