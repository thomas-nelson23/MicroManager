/**
 * RP2040 (Raspberry Pi Pico, arduino-pico core) flashing. The boot ROM's BOOTSEL mode shows a USB
 * drive (RPI-RP2) that flashes any UF2 file copied onto it and then reboots into the new sketch.
 *
 * A running arduino-pico sketch reboots into BOOTSEL when the host opens its USB serial at 1200 baud
 * and closes it again (the "1200-baud touch").
 */
import { type SerialTransport, sleep } from "./transport.ts";

export const RP2040_VID = 0x2e8a;
/** USB vendors whose RP2040 boards run arduino-pico with USB serial: Raspberry Pi, Adafruit. */
export const RP2040_VIDS = [RP2040_VID, 0x239a];
/** USB serial of a running arduino-pico sketch on a Pico. */
export const PICO_SERIAL_PID = 0x000a;
/** The boot ROM in BOOTSEL mode (drive + PICOBOOT). */
export const RP2040_BOOTSEL_PID = 0x0003;

const UF2_MAGIC0 = 0x0a324655;
const UF2_MAGIC1 = 0x9e5d5157;
const UF2_MAGIC_END = 0x0ab16f30;
const UF2_FAMILY_FLAG = 0x2000;
export const RP2040_FAMILY = 0xe48bff56;

/** Check a UF2 image is whole and meant for an RP2040, so a wrong file isn't copied onto the drive. Returns its block count. */
export function checkUf2(data: Uint8Array, family = RP2040_FAMILY): number {
  if (data.length === 0 || data.length % 512 !== 0) throw new Error("this isn't a UF2 file (its size isn't a multiple of 512 bytes)");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const blocks = data.length / 512;
  for (let i = 0; i < blocks; i++) {
    const o = i * 512;
    if (v.getUint32(o, true) !== UF2_MAGIC0 || v.getUint32(o + 4, true) !== UF2_MAGIC1 || v.getUint32(o + 508, true) !== UF2_MAGIC_END) {
      throw new Error(`this isn't a UF2 file (block ${i} is damaged)`);
    }
    const flags = v.getUint32(o + 8, true);
    if (flags & UF2_FAMILY_FLAG && v.getUint32(o + 28, true) !== family) throw new Error("this UF2 was built for another chip, not an RP2040: was it built for this board?");
    if (v.getUint32(o + 24, true) !== blocks) throw new Error("this UF2 file is incomplete");
  }
  return blocks;
}

/** Ask a running sketch to reboot into BOOTSEL: open its USB serial at 1200 baud and drop DTR. The port is left closed. */
export async function rp2040EnterBootloader(port: SerialTransport) {
  if (port.isOpen) await port.close();
  await port.open(1200);
  await port.setSignals({ dtr: false }).catch(() => {});
  await sleep(100);
  await port.close().catch(() => {});
}
