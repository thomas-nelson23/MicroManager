/** SerialTransport over the browser's Web Serial API (Chrome/Edge, secure context required). */
import { ByteQueue, type SerialTransport } from "./transport.ts";

export class WebSerialTransport implements SerialTransport {
  readonly rx = new ByteQueue();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private pump: Promise<void> | null = null;
  private opened = false;

  constructor(public port: SerialPort) {}

  /**
   * Point the closed transport at another SerialPort: a Teensy shows up as a new port each time it
   * reboots, because its USB serial is part of the sketch.
   */
  rebind(port: SerialPort) {
    if (this.opened) throw new Error("close the port before rebinding it");
    this.port = port;
  }

  /** Ask the user to pick a port (must be called from a click handler). */
  static async request(filters?: SerialPortFilter[]): Promise<WebSerialTransport> {
    if (!("serial" in navigator)) throw new Error("This browser has no Web Serial. Use Chrome or Edge, over HTTPS or localhost.");
    return new WebSerialTransport(await navigator.serial.requestPort(filters ? { filters } : {}));
  }

  get isOpen() {
    return this.opened;
  }

  async open(baudRate: number): Promise<void> {
    if (this.opened) throw new Error("port already open");
    await this.port.open({ baudRate, bufferSize: 65536 });
    this.opened = true;
    this.rx.clear();
    const reader = this.port.readable!.getReader();
    this.reader = reader;
    this.pump = (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) this.rx.push(value);
        }
      } catch {
        // read errors (e.g. device reset) end the pump; close() cleans up
      } finally {
        reader.releaseLock();
      }
    })();
  }

  async close(): Promise<void> {
    if (!this.opened) return;
    this.opened = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* already gone */
    }
    await this.pump;
    this.reader = null;
    this.pump = null;
    try {
      await this.port.close();
    } catch {
      /* device may have disappeared */
    }
  }

  async write(data: Uint8Array): Promise<void> {
    const w = this.port.writable!.getWriter();
    try {
      await w.write(data);
    } finally {
      w.releaseLock();
    }
  }

  async setSignals(s: { dtr?: boolean; rts?: boolean }): Promise<void> {
    const sig: SerialOutputSignals = {};
    if (s.dtr !== undefined) sig.dataTerminalReady = s.dtr;
    if (s.rts !== undefined) sig.requestToSend = s.rts;
    await this.port.setSignals(sig);
  }
}
