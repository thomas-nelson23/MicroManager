/**
 * Teensy 4.x flashing through PJRC's HalfKay bootloader, which is a USB HID device (16C0:0478).
 *
 * The protocol, as teensy_loader_cli implements it for the Teensy 4: the image is written in 1024-byte
 * blocks, each sent as one 1088-byte HID report (a 64-byte header whose first three bytes are the block's
 * offset, then the data). Blocks that are all 0xFF are skipped, except the first, whose write erases the
 * flash and can take many seconds. A report whose header starts FF FF FF reboots into the new sketch.
 * Teensy 4 hex files address the flash at its FlexSPI base, 0x60000000; HalfKay wants offsets.
 *
 * A running sketch with USB serial (every Teensyduino sketch has it) reboots into HalfKay when the host
 * sets the serial port to 134 baud.
 */
import type { HexImage } from "./ihex.ts";
import { type Progress, type SerialTransport, sleep } from "./transport.ts";

export const TEENSY_VID = 0x16c0;
/** USB serial of a running Teensyduino sketch. */
export const TEENSY_SERIAL_PID = 0x0483;
/** The HalfKay bootloader. */
export const HALFKAY_PID = 0x0478;

export interface TeensyModel {
  name: string;
  /** Flash available for code, bytes. */
  codeSize: number;
  blockSize: number;
  /** Where the hex file puts the flash. */
  flashBase: number;
}

export const TEENSY41: TeensyModel = { name: "Teensy 4.1", codeSize: 8126464, blockSize: 1024, flashBase: 0x60000000 };

/** A HalfKay device: sends one output report (report id 0) of exactly the bootloader's report size. */
export interface HalfKayTransport {
  send(report: Uint8Array): Promise<void>;
}

const HEADER = 64;

/** The blocks to write: [offset, data], first block always included, all-0xFF blocks skipped. */
export function teensyBlocks(img: HexImage, model: TeensyModel = TEENSY41): Array<{ offset: number; data: Uint8Array }> {
  let start = img.start;
  if (start >= model.flashBase && start < model.flashBase + model.codeSize) start -= model.flashBase;
  const end = start + img.data.length;
  if (start < 0 || end > model.codeSize) {
    throw new Error(`this hex doesn't fit a ${model.name} (0x${img.start.toString(16)}, ${img.data.length} bytes): was it built for this board?`);
  }
  const bs = model.blockSize;
  const out: Array<{ offset: number; data: Uint8Array }> = [];
  for (let a = Math.floor(start / bs) * bs; a < end; a += bs) {
    const block = new Uint8Array(bs).fill(0xff);
    for (let k = 0; k < bs; k++) {
      const src = a + k - start;
      if (src >= 0 && src < img.data.length) block[k] = img.data[src]!;
    }
    if (a === 0 || block.some((b) => b !== 0xff)) out.push({ offset: a, data: block });
  }
  if (out[0]?.offset !== 0) out.unshift({ offset: 0, data: new Uint8Array(bs).fill(0xff) });
  return out;
}

export function halfKayReport(offset: number, data: Uint8Array, model: TeensyModel = TEENSY41): Uint8Array {
  const r = new Uint8Array(HEADER + model.blockSize);
  r[0] = offset & 0xff;
  r[1] = (offset >> 8) & 0xff;
  r[2] = (offset >> 16) & 0xff;
  r.set(data, HEADER);
  return r;
}

export function halfKayBootReport(model: TeensyModel = TEENSY41): Uint8Array {
  const r = new Uint8Array(HEADER + model.blockSize);
  r[0] = r[1] = r[2] = 0xff;
  return r;
}

/** Send, retrying until the deadline: HalfKay refuses reports while it is still erasing or writing. */
async function sendWithRetry(hid: HalfKayTransport, report: Uint8Array, seconds: number) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    try {
      await hid.send(report);
      return;
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await sleep(10);
    }
  }
}

/** Write a sketch with HalfKay and reboot into it. */
export async function flashTeensy(hid: HalfKayTransport, img: HexImage, progress: Progress = () => {}, model: TeensyModel = TEENSY41) {
  const blocks = teensyBlocks(img, model);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    progress({ stage: i === 0 ? "erase" : "write", done: i, total: blocks.length });
    await sendWithRetry(hid, halfKayReport(b.offset, b.data, model), i === 0 ? 45 : 5);
  }
  progress({ stage: "write", done: blocks.length, total: blocks.length });
  await sendWithRetry(hid, halfKayBootReport(model), 2);
  progress({ stage: "done" });
}

/**
 * Ask a running sketch to reboot into HalfKay: open its USB serial at 134 baud. The port is left closed.
 * The serial device disappears when this works.
 */
export async function teensyEnterBootloader(port: SerialTransport) {
  if (port.isOpen) await port.close();
  await port.open(134);
  await sleep(100);
  await port.close().catch(() => {});
}

/**
 * Restart a sketch that uses NexPass on a Teensy: NexPass reboots the board when the host drops DTR
 * while it is in TFT-upload passthrough. The port is left closed.
 */
export async function teensyRestart(port: SerialTransport) {
  if (!port.isOpen) await port.open(115200);
  await port.setSignals({ dtr: true });
  await sleep(50);
  await port.setSignals({ dtr: false });
  await sleep(50);
  await port.close().catch(() => {});
}
