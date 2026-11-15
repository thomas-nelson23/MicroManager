/**
 * Nano Every (ATmega4809) flashing through its on-board USB chip, which emulates a JTAGICE mkII with a
 * UPDI back end ("jtag2updi"). The command sequence mirrors what avrdude 6.3 sends for
 * `-patmega4809 -cjtag2updi -b115200 -e -D` (captured on real hardware, see spike/avrdude-trace.log).
 */
import { type SerialTransport, type Progress, TimeoutError, sleep } from "./transport.ts";
import { type HexImage, pages } from "./ihex.ts";

const MESSAGE_START = 0x1b;
const TOKEN = 0x0e;

const CMND = {
  SIGN_OFF: 0x00,
  GET_SIGN_ON: 0x01,
  SET_PARAMETER: 0x02,
  WRITE_MEMORY: 0x04,
  READ_MEMORY: 0x05,
  GO: 0x08,
  RESET: 0x0b,
  SET_DEVICE_DESCRIPTOR: 0x0c,
  GET_SYNC: 0x0f,
  ENTER_PROGMODE: 0x14,
  LEAVE_PROGMODE: 0x15,
  XMEGA_ERASE: 0x34,
} as const;

const RSP_OK = 0x80;
const RSP_MEMORY = 0x82;
const RSP_SIGN_ON = 0x86;

const MTYPE = { FLASH: 0xc0, FUSE: 0xb2, SIGNATURE: 0xb4 } as const;

export interface UpdiChip {
  name: string;
  signature: [number, number, number];
  flashBase: number; // flash as seen in the UPDI data space
  flashSize: number;
  pageSize: number;
  sigAddress: number;
  fuseBase: number;
  /** Non-zero bytes of the 298-byte device descriptor avrdude sends (offset -> value). */
  descriptor: Array<[number, number]>;
}

export const ATMEGA4809: UpdiChip = {
  name: "ATmega4809",
  signature: [0x1e, 0x96, 0x51],
  flashBase: 0x4000,
  flashSize: 49152,
  pageSize: 128,
  sigAddress: 0x1100,
  fuseBase: 0x1280,
  descriptor: [[243, 0x80], [245, 0x40], [253, 0xc0], [281, 0x80], [282, 0x01], [288, 0x01], [289, 0x02]],
};

/** Fuses the Arduino megaAVR core writes on every upload (boards.txt: OSCCFG, SYSCFG0, BOOTEND). */
export const NANO_EVERY_FUSES: Array<[number, number]> = [
  [2, 0x01],
  [5, 0xc9],
  [8, 0x00],
];

export function crc16(data: Uint8Array): number {
  let c = 0xffff;
  for (const x of data) {
    c ^= x;
    for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0x8408 : c >>> 1;
  }
  return c;
}

export function encodeFrame(seq: number, body: Uint8Array): Uint8Array {
  const f = new Uint8Array(8 + body.length + 2);
  const v = new DataView(f.buffer);
  f[0] = MESSAGE_START;
  v.setUint16(1, seq, true);
  v.setUint32(3, body.length, true);
  f[7] = TOKEN;
  f.set(body, 8);
  v.setUint16(8 + body.length, crc16(f.subarray(0, 8 + body.length)), true);
  return f;
}

const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

export class Jtag2Updi {
  private seq = 0;
  constructor(
    private port: SerialTransport,
    private log: (s: string) => void = () => {},
  ) {}

  /** Send one command and return the response body. Throws on timeout or a failure response. */
  async command(body: number[] | Uint8Array, timeoutMs = 2000, expect: number = RSP_OK): Promise<Uint8Array> {
    const seq = this.seq;
    this.seq = (this.seq + 1) & 0xffff;
    await this.port.write(encodeFrame(seq, Uint8Array.from(body)));
    const rsp = await this.receive(seq, timeoutMs);
    if (rsp[0] !== expect) {
      throw new Error(`jtag2updi: command 0x${body[0]!.toString(16)} failed, response 0x${rsp[0]?.toString(16)}`);
    }
    return rsp;
  }

  private async receive(seq: number, timeoutMs: number): Promise<Uint8Array> {
    const rx = this.port.rx;
    const deadline = Date.now() + timeoutMs;
    const left = () => Math.max(1, deadline - Date.now());
    for (;;) {
      // resync on MESSAGE_START
      const b = await rx.read(1, left(), "jtag2updi response");
      if (b[0] !== MESSAGE_START) continue;
      const hdr = await rx.read(7, left(), "jtag2updi header");
      const v = new DataView(hdr.buffer, hdr.byteOffset);
      const rseq = v.getUint16(0, true);
      const size = v.getUint32(2, true);
      if (hdr[6] !== TOKEN || size > 1024) continue;
      const rest = await rx.read(size + 2, left(), "jtag2updi body");
      const whole = new Uint8Array(8 + size);
      whole[0] = MESSAGE_START;
      whole.set(hdr, 1);
      whole.set(rest.subarray(0, size), 8);
      const crc = rest[size]! | (rest[size + 1]! << 8);
      if (crc !== crc16(whole)) {
        this.log("jtag2updi: bad CRC, skipping frame");
        continue;
      }
      if (rseq === 0xffff) continue; // event, not a reply
      if (seq >= 0 && rseq !== seq) {
        this.log(`jtag2updi: stale reply seq ${rseq} (want ${seq})`);
        continue;
      }
      return rest.subarray(0, size);
    }
  }

  /**
   * The first reply after entering UPDI mode can take about a second. Resending too early makes the
   * programmer answer twice and lose step, so wait long and accept the sign-on reply of any attempt.
   */
  async signOn(attempts = 3): Promise<void> {
    this.port.rx.clear();
    for (let i = 0; i < attempts; i++) {
      this.seq = i;
      await this.port.write(encodeFrame(i, Uint8Array.of(CMND.GET_SIGN_ON)));
      try {
        const r = await this.receive(-1, 2500);
        if (r[0] !== RSP_SIGN_ON) throw new Error(`jtag2updi: unexpected sign-on response 0x${r[0]?.toString(16)}`);
        this.seq = i + 1;
        this.log(`signed on: ${new TextDecoder().decode(r.subarray(16).filter((c) => c >= 0x20))}`);
        return;
      } catch (e) {
        if (!(e instanceof TimeoutError)) throw e;
      }
    }
    throw new Error("Nano Every did not enter programming mode (no answer to sign-on). Unplug and replug the board, then retry.");
  }

  async readMemory(mtype: number, address: number, size: number): Promise<Uint8Array> {
    const r = await this.command([CMND.READ_MEMORY, mtype, ...u32(size), ...u32(address)], 2000, RSP_MEMORY);
    return r.subarray(1);
  }

  async writeMemory(mtype: number, address: number, data: Uint8Array): Promise<void> {
    await this.command([CMND.WRITE_MEMORY, mtype, ...u32(data.length), ...u32(address), ...data], 3000);
  }

  /** Full avrdude-equivalent session: sign on, erase, write flash pages, write fuses, run. */
  async program(chip: UpdiChip, img: HexImage, fuses: Array<[number, number]>, progress: Progress = () => {}, verify = true) {
    progress({ stage: "connect" });
    await this.init(chip);

    const sig = await this.readMemory(MTYPE.SIGNATURE, chip.sigAddress, 3);
    const want = chip.signature;
    if (sig[0] !== want[0] || sig[1] !== want[1] || sig[2] !== want[2]) {
      throw new Error(`wrong chip: signature ${[...sig].map((b) => b.toString(16)).join(" ")}, expected ${chip.name}`);
    }
    if (img.start + img.data.length > chip.flashSize) throw new Error(`sketch is ${img.data.length} bytes, ${chip.name} has ${chip.flashSize}`);

    progress({ stage: "erase" });
    await this.command([CMND.XMEGA_ERASE, 0x00, ...u32(0)], 5000);

    const list = pages(img, chip.pageSize);
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      progress({ stage: "write", done: i, total: list.length });
      await this.writeMemory(MTYPE.FLASH, chip.flashBase + p.address, p.data);
    }
    progress({ stage: "write", done: list.length, total: list.length });

    if (verify) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!;
        progress({ stage: "verify", done: i, total: list.length });
        const got = await this.readMemory(MTYPE.FLASH, chip.flashBase + p.address, p.data.length);
        const bad = p.data.findIndex((b, k) => got[k] !== b);
        if (bad >= 0) throw new Error(`verify failed at 0x${(p.address + bad).toString(16)}`);
      }
      progress({ stage: "verify", done: list.length, total: list.length });
    }

    progress({ stage: "fuses" });
    for (const [n, v] of fuses) await this.writeMemory(MTYPE.FUSE, chip.fuseBase + n, Uint8Array.of(v));

    progress({ stage: "finish" });
    await this.finish();
  }

  /** Sign on, configure for the chip and enter programming mode (the target is halted). */
  async init(chip: UpdiChip): Promise<void> {
    await this.signOn();
    await this.command([CMND.SET_PARAMETER, 0x03, 0x06]); // emulator mode: UPDI
    await this.command([CMND.GET_SYNC]);
    await this.command([CMND.SET_PARAMETER, 0x05, 0x07]); // baud 115200
    const descr = new Uint8Array(299);
    descr[0] = CMND.SET_DEVICE_DESCRIPTOR;
    for (const [off, val] of chip.descriptor) descr[1 + off] = val;
    await this.command(descr);
    await this.command([CMND.RESET, 0x01]);
    await this.command([CMND.ENTER_PROGMODE], 2000);
  }

  /** Leave programming mode, reset and run the target, and hand the USB port back to the sketch. */
  async finish(): Promise<void> {
    await this.command([CMND.LEAVE_PROGMODE]);
    await this.command([CMND.RESET, 0x01]);
    await this.command([CMND.GO]);
    await this.command([CMND.SIGN_OFF]);
  }
}

/**
 * Put the Nano Every's USB chip into programming mode.
 * A plain 1200-baud touch fails if the previous session closed by dropping DTR (which browsers and Linux
 * do by default); opening once with DTR high first, then toggling DTR at 1200, works either way.
 * Found experimentally on 2026-11-15 (spike/exp_touch.py).
 */
export async function enterUpdiMode(port: SerialTransport): Promise<void> {
  if (port.isOpen) await port.close();
  await port.open(115200);
  await port.setSignals({ dtr: true });
  await sleep(100);
  await port.close();
  await port.open(1200);
  for (const dtr of [false, true, false, true, false]) {
    await port.setSignals({ dtr });
    await sleep(50);
  }
  await port.close();
  await sleep(100);
}

/**
 * Restart the sketch on a Nano Every. After a 1200-baud touch the USB chip stays in programming mode until
 * a programming session signs off, so run a minimal session: init, then leave/reset/go/sign off.
 * The port is left closed.
 */
export async function restartNanoEvery(port: SerialTransport, log?: (s: string) => void) {
  await enterUpdiMode(port);
  await port.open(115200);
  try {
    await port.setSignals({ dtr: true });
    const j = new Jtag2Updi(port, log);
    await j.init(ATMEGA4809);
    await j.finish();
  } finally {
    await port.close();
  }
}

/** Flash a Nano Every from a parsed hex image. The port is left closed; the sketch is running afterwards. */
export async function flashNanoEvery(port: SerialTransport, img: HexImage, progress: Progress = () => {}, log?: (s: string) => void) {
  await enterUpdiMode(port);
  await port.open(115200);
  try {
    await port.setSignals({ dtr: true });
    await new Jtag2Updi(port, log).program(ATMEGA4809, img, NANO_EVERY_FUSES, progress);
  } finally {
    // Close with DTR still high so the next programming session starts cleanly.
    await port.close();
  }
  progress({ stage: "done" });
}
