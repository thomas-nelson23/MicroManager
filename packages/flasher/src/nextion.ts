/**
 * Nextion display over a serial transport: handshake, instructions, and TFT upload (protocol v1.1).
 * The transport talks to a USB passthrough (NexBridge or the NexPass library in a sketch) that forwards
 * bytes to the display and follows `whmi-wri` baud changes.
 */
import { type SerialTransport, type Progress, sleep, TimeoutError } from "./transport.ts";
import { restartNanoEvery } from "./jtag2updi.ts";

const END = Uint8Array.of(0xff, 0xff, 0xff);
const enc = new TextEncoder();
const dec = new TextDecoder("latin1");

export interface DisplayInfo {
  raw: string;
  touch: string;
  model: string;
  firmware: string;
  mcu: string;
  serial: string;
  flash: string;
}

export const RETURN_CODES: Record<number, string> = {
  0x00: "invalid instruction", 0x01: "ok", 0x02: "invalid component id", 0x03: "invalid page id",
  0x04: "invalid picture id", 0x05: "invalid font id", 0x11: "invalid baud", 0x1a: "invalid variable name",
  0x1b: "invalid variable operation", 0x1c: "assignment failed", 0x1e: "invalid parameter count",
  0x1f: "IO operation failed", 0x20: "invalid escape character", 0x23: "variable name too long",
  0x24: "serial buffer overflow", 0x86: "auto sleep", 0x87: "auto wake", 0x88: "ready",
};

export type NexReply =
  | { string: string }
  | { number: number }
  | { touch: { page: number; component: number; event: "press" | "release" } }
  | { page: number }
  | { code: string; meaning: string }
  | { raw: string };

/** Decode one display message (without the FF FF FF terminator). */
export function decodeReply(m: Uint8Array): NexReply {
  const t = m[0];
  if (t === 0x70) return { string: dec.decode(m.subarray(1)) };
  if (t === 0x71 && m.length >= 5) return { number: new DataView(m.buffer, m.byteOffset + 1, 4).getInt32(0, true) };
  if (t === 0x65 && m.length >= 4) return { touch: { page: m[1]!, component: m[2]!, event: m[3] ? "press" : "release" } };
  if (t === 0x66 && m.length >= 2) return { page: m[1]! };
  if (t !== undefined && m.length === 1 && t in RETURN_CODES) return { code: `0x${t.toString(16)}`, meaning: RETURN_CODES[t]! };
  return { raw: [...m].map((b) => b.toString(16).padStart(2, "0")).join(" ") };
}

/** Split buffered bytes into FF FF FF-terminated messages; returns messages and the unconsumed rest. */
export function splitMessages(buf: Uint8Array): { messages: Uint8Array[]; rest: Uint8Array } {
  const messages: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i + 2 < buf.length; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xff && buf[i + 2] === 0xff) {
      messages.push(buf.subarray(start, i));
      i += 2;
      start = i + 1;
    }
  }
  return { messages, rest: buf.subarray(start) };
}

export class Nextion {
  constructor(private port: SerialTransport) {}

  async send(instruction: string): Promise<void> {
    const b = enc.encode(instruction);
    const out = new Uint8Array(b.length + 3);
    out.set(b);
    out.set(END, b.length);
    await this.port.write(out);
  }

  /** Collect complete messages for up to `ms`, returning early once `until` is satisfied. */
  async collect(ms: number, until?: (msgs: Uint8Array[]) => boolean): Promise<Uint8Array[]> {
    const deadline = Date.now() + ms;
    let pending: Uint8Array = new Uint8Array();
    const msgs: Uint8Array[] = [];
    while (Date.now() < deadline) {
      try {
        await this.port.rx.waitFor(() => this.port.rx.available > 0, deadline - Date.now());
      } catch (e) {
        if (e instanceof TimeoutError) break;
        throw e;
      }
      const chunk = this.port.rx.take();
      const all = new Uint8Array(pending.length + chunk.length);
      all.set(pending);
      all.set(chunk, pending.length);
      const { messages, rest } = splitMessages(all);
      msgs.push(...messages);
      pending = rest;
      if (until?.(msgs)) break;
    }
    return msgs;
  }

  /** Handshake. Returns undefined if the display does not answer. */
  async connect(): Promise<DisplayInfo | undefined> {
    await this.port.write(END);
    await this.send("DRAKJHSUYDGBNCJHGJKSHBDN"); // leaves recmod=1 (protocol reparse) if active
    await sleep(200);
    this.port.rx.clear();
    await this.send("connect");
    const msgs = await this.collect(2000, (m) => m.some((x) => dec.decode(x).startsWith("comok")));
    const hit = msgs.map((x) => dec.decode(x)).find((s) => s.startsWith("comok"));
    if (!hit) return undefined;
    const [touch, , model, firmware, mcu, serial, flash] = hit.slice(6).split(",");
    return { raw: hit, touch: touch ?? "", model: model ?? "", firmware: firmware ?? "", mcu: mcu ?? "", serial: serial ?? "", flash: flash ?? "" };
  }

  /** Send an instruction and return the decoded replies that arrive within `waitMs`. */
  async command(instruction: string, waitMs = 600): Promise<NexReply[]> {
    this.port.rx.clear();
    await this.send(instruction);
    const isGet = /^\s*get\s/.test(instruction);
    const msgs = await this.collect(waitMs, (m) => m.length > 0 && (isGet || m.some((x) => x.length === 1)));
    return msgs.map(decodeReply);
  }

  /**
   * Upload a TFT. The display must be connected first. Chunks of 4096 bytes are each acknowledged
   * with 0x05. Writes are paced just under the line rate because the passthrough's buffers are small.
   */
  async uploadTft(tft: Uint8Array, opts: { uploadBaud?: number; hostBaud?: number; progress?: Progress } = {}) {
    const uploadBaud = opts.uploadBaud ?? 115200;
    const line = Math.min(opts.hostBaud ?? 115200, uploadBaud);
    const progress = opts.progress ?? (() => {});
    this.port.rx.clear();
    await this.send(`whmi-wri ${tft.length},${uploadBaud},0`);
    await this.waitAck(3000, "display did not acknowledge whmi-wri");
    const perByteMs = (10 / line) * 1.08 * 1000;
    const t0 = Date.now();
    let sent = 0;
    while (sent < tft.length) {
      const chunk = tft.subarray(sent, sent + 4096);
      for (let i = 0; i < chunk.length; i += 256) {
        const piece = chunk.subarray(i, i + 256);
        const start = Date.now();
        await this.port.write(piece);
        const wait = piece.length * perByteMs - (Date.now() - start);
        if (wait > 0) await sleep(wait);
      }
      sent += chunk.length;
      await this.waitAck(5000, `no ack after ${sent} bytes; the display is in update mode, retry the upload`);
      progress({ stage: "upload", done: sent, total: tft.length, message: `${((Date.now() - t0) / 1000).toFixed(0)} s` });
    }
  }

  private async waitAck(ms: number, error: string) {
    const rx = this.port.rx;
    try {
      await rx.waitFor(() => rx.peek().includes(0x05), ms);
    } catch (e) {
      if (e instanceof TimeoutError) throw new Error(error);
      throw e;
    }
    rx.clear();
  }
}

/**
 * Open the passthrough and connect to the display. If it doesn't answer (e.g. the bridge is still at the
 * upload baud after a previous upload), reset the board (`reset`, a Nano Every restart by default) and
 * try once more.
 */
export async function openDisplay(
  port: SerialTransport,
  hostBaud = 115200,
  reset: (port: SerialTransport) => Promise<void> = resetBoard,
): Promise<{ nex: Nextion; info: DisplayInfo }> {
  const nex = new Nextion(port);
  for (const again of [false, true]) {
    if (again) {
      await reset(port);
    }
    if (!port.isOpen) await port.open(hostBaud);
    await sleep(500);
    const info = await nex.connect();
    if (info) return { nex, info };
  }
  throw new Error("no reply to 'connect': is the display powered and wired to the Arduino, and does the sketch include the passthrough?");
}

/** Restart the sketch on a Nano Every. The port is left closed. */
export async function resetBoard(port: SerialTransport) {
  await restartNanoEvery(port);
  await sleep(1500); // let the sketch boot and open the display port
}
