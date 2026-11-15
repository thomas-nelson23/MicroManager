/**
 * The USB device on this computer, through Web Serial: choosing the port, flashing builds and
 * sending display commands. One operation at a time.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { decodeReply, flashNanoEvery, openDisplay, parseIntelHex, resetBoard, type DisplayInfo } from "@nextion-arduino/flasher";
import { WebSerialTransport } from "@nextion-arduino/flasher/web";

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
  portLabel: string | null;
  display: DisplayInfo | null;
  busy: Progress | null;
  choosePort(): Promise<boolean>;
  flash(job: FlashJob): Promise<{ status: "done" | "failed"; message: string }>;
  run(commands: string[], listenSeconds?: number): Promise<{ results: CommandResult[]; events: unknown[] }>;
}

const Ctx = createContext<Device | null>(null);
export const useDevice = () => useContext(Ctx)!;

const ARDUINO_FILTERS: SerialPortFilter[] = [{ usbVendorId: 0x2341 }, { usbVendorId: 0x2a03 }, { usbVendorId: 0x1a86 }, { usbVendorId: 0x0403 }, { usbVendorId: 0x10c4 }];

function label(p: SerialPort): string {
  const i = p.getInfo();
  if (i.usbVendorId === 0x2341 && i.usbProductId === 0x0058) return "Arduino Nano Every";
  if (i.usbVendorId === 0x2341) return "Arduino";
  return i.usbVendorId ? `USB ${i.usbVendorId.toString(16)}:${i.usbProductId?.toString(16)}` : "Serial port";
}

export function DeviceProvider({ children }: { children: ReactNode }) {
  const supported = typeof navigator !== "undefined" && "serial" in navigator;
  const [transport, setTransport] = useState<WebSerialTransport | null>(null);
  const [display, setDisplay] = useState<DisplayInfo | null>(null);
  const [busy, setBusy] = useState<Progress | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const tRef = useRef<WebSerialTransport | null>(null);
  tRef.current = transport;

  useEffect(() => {
    if (!supported) return;
    navigator.serial.getPorts().then((ports) => {
      if (ports[0] && !tRef.current) setTransport(new WebSerialTransport(ports[0]));
    });
    const onDisconnect = (e: Event) => {
      if (tRef.current && (e.target as SerialPort) === tRef.current.port) {
        setTransport(null);
        setDisplay(null);
      }
    };
    navigator.serial.addEventListener("disconnect", onDisconnect);
    return () => navigator.serial.removeEventListener("disconnect", onDisconnect);
  }, [supported]);

  /** Run one serial operation at a time; the port is always left closed afterwards. */
  const exclusive = useCallback(<T,>(fn: (t: WebSerialTransport) => Promise<T>): Promise<T> => {
    const run = async () => {
      const t = tRef.current;
      if (!t) throw new Error("No device connected. Choose the Arduino's port first.");
      try {
        return await fn(t);
      } finally {
        await t.close().catch(() => {});
        setBusy(null);
      }
    };
    const p = queue.current.then(run, run);
    queue.current = p.catch(() => {});
    return p;
  }, []);

  const choosePort = useCallback(async () => {
    if (!supported) return false;
    try {
      const t = await WebSerialTransport.request(ARDUINO_FILTERS);
      if (tRef.current?.isOpen) await tRef.current.close();
      setTransport(t);
      setDisplay(null);
      return true;
    } catch {
      return false; // picker cancelled
    }
  }, [supported]);

  const flash = useCallback(
    (job: FlashJob) =>
      exclusive(async (t) => {
        try {
          if (job.sketchUrl) {
            setBusy({ label: "Downloading sketch" });
            const r = await fetch(job.sketchUrl);
            if (!r.ok) throw new Error("couldn't download the sketch");
            const img = parseIntelHex(await r.text());
            await flashNanoEvery(t, img, (p) => setBusy({ label: p.stage === "write" ? "Writing sketch" : p.stage === "verify" ? "Verifying sketch" : `Sketch: ${p.stage}`, done: p.done, total: p.total }));
            await new Promise((res) => setTimeout(res, 1500)); // let the sketch boot
          }
          if (job.screenUrl) {
            setBusy({ label: "Downloading screen" });
            const r = await fetch(job.screenUrl);
            if (!r.ok) throw new Error("couldn't download the screen");
            const tft = new Uint8Array(await r.arrayBuffer());
            setBusy({ label: "Connecting to the display" });
            const { nex, info } = await openDisplay(t);
            setDisplay(info);
            if (job.expectModel && !info.model.startsWith(job.expectModel)) {
              throw new Error(`the display is a ${info.model}, but this project is built for ${job.expectModel}`);
            }
            await nex.uploadTft(tft, { progress: (p) => setBusy({ label: "Uploading screen", done: p.done, total: p.total }) });
            await t.close();
            setBusy({ label: "Restarting the board" });
            await resetBoard(t);
          }
          const parts = [job.sketchUrl && "sketch", job.screenUrl && "screen"].filter(Boolean).join(" and ");
          return { status: "done" as const, message: `${parts} flashed` };
        } catch (e) {
          return { status: "failed" as const, message: e instanceof Error ? e.message : String(e) };
        }
      }),
    [exclusive],
  );

  const run = useCallback(
    (commands: string[], listenSeconds = 0) =>
      exclusive(async (t) => {
        setBusy({ label: "Talking to the display" });
        const { nex, info } = await openDisplay(t);
        setDisplay(info);
        await nex.command("bkcmd=3");
        const results: CommandResult[] = [];
        for (const cmd of commands) results.push({ cmd, reply: await nex.command(cmd) });
        let events: unknown[] = [];
        if (listenSeconds > 0) {
          setBusy({ label: `Listening for ${listenSeconds} s` });
          t.rx.clear();
          const msgs = await nex.collect(listenSeconds * 1000);
          events = msgs.map(decodeReply);
        }
        return { results, events };
      }),
    [exclusive],
  );

  const value = useMemo<Device>(
    () => ({ supported, portLabel: transport ? label(transport.port) : null, display, busy, choosePort, flash, run }),
    [supported, transport, display, busy, choosePort, flash, run],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
