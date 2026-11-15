/** SerialTransport for Node using the `serialport` package. Used for tests and local scripts. */
import { SerialPort } from "serialport";
import { ByteQueue, type SerialTransport } from "./transport.ts";

export class NodeSerialTransport implements SerialTransport {
  readonly rx = new ByteQueue();
  private port: SerialPort | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;

  constructor(private path: string) {}

  get isOpen() {
    return this.port !== null;
  }

  async open(baudRate: number): Promise<void> {
    if (this.port) throw new Error("port already open");
    const p = new SerialPort({ path: this.path, baudRate, autoOpen: false });
    await new Promise<void>((res, rej) => p.open((e) => (e ? rej(e) : res())));
    this.rx.clear();
    const t0 = Date.now();
    p.on("data", (d: Buffer) => {
      if (process.env.SERIAL_DEBUG) console.log(`  rx +${Date.now() - t0}ms ${d.toString("hex")}`);
      this.rx.push(new Uint8Array(d));
    });
    if (process.env.SERIAL_DEBUG) console.log(`  open ${baudRate}`);
    this.port = p;
    // With serialport 13 on Node 26, incoming data is not delivered while the event loop sits idle in a
    // single long timer (replies showed up only after the next write). A short ticking timer while the
    // port is open keeps the poller serviced. Found 2026-11-15 (scripts/debug-await.ts).
    this.tick = setInterval(() => {}, 5);
  }

  async close(): Promise<void> {
    const p = this.port;
    if (!p) return;
    this.port = null;
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    await new Promise<void>((res) => p.close(() => res()));
  }

  async write(data: Uint8Array): Promise<void> {
    const p = this.must();
    if (process.env.SERIAL_DEBUG) console.log(`  tx ${Buffer.from(data.subarray(0, 24)).toString("hex")}${data.length > 24 ? "…" : ""}`);
    await new Promise<void>((res, rej) => p.write(Buffer.from(data), (e) => (e ? rej(e) : res())));
    await new Promise<void>((res, rej) => p.drain((e) => (e ? rej(e) : res())));
  }

  async setSignals(s: { dtr?: boolean; rts?: boolean }): Promise<void> {
    const p = this.must();
    await new Promise<void>((res, rej) => p.set(s, (e) => (e ? rej(e) : res())));
  }

  private must(): SerialPort {
    if (!this.port) throw new Error("port not open");
    return this.port;
  }
}
