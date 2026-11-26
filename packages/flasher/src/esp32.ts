/**
 * ESP32 and ESP32-S3 (Espressif arduino-esp32 core). Builds are the core's merged image: bootloader,
 * partition table, boot_app0 and the app in one file, written at flash offset 0. The ROM bootloader takes
 * it over the USB serial port (web-esp32.ts drives esptool-js for that).
 *
 * Dev boards wire the USB-serial chip's DTR and RTS to the chip's IO0 and EN through two transistors
 * (esptool's "auto reset"): RTS alone pulls EN low, which resets the chip into the running sketch.
 */
import { type SerialTransport, sleep } from "./transport.ts";

/** Espressif's own USB id (the ESP32-S3's native USB port). */
export const ESPRESSIF_VID = 0x303a;
/** USB-serial chips ESP32 dev boards use: Silicon Labs CP210x, WCH CH340/CH9102. */
export const ESP32_BRIDGE_VIDS = [0x10c4, 0x1a86];
export const ESP32_VIDS = [...ESP32_BRIDGE_VIDS, ESPRESSIF_VID];

const IMAGE_MAGIC = 0xe9;
/** Chip ids in the bootloader image's extended header, as esptool names the chips. */
const CHIP_IDS: Record<number, string> = { 0x0000: "ESP32", 0x0002: "ESP32-S2", 0x0005: "ESP32-C3", 0x0009: "ESP32-S3", 0x000c: "ESP32-C2", 0x000d: "ESP32-C6", 0x0010: "ESP32-H2", 0x0012: "ESP32-P4" };

/**
 * Check a merged ESP32 image is whole enough to flash at offset 0, and say which chip it was built for.
 * The bootloader sits at 0x1000 on an ESP32 and at 0 on the newer chips.
 */
export function checkEsp32Image(data: Uint8Array): { chip: string } {
  for (const at of [0, 0x1000]) {
    if (data.length < at + 24 || data[at] !== IMAGE_MAGIC) continue;
    const id = data[at + 12]! | (data[at + 13]! << 8);
    const chip = CHIP_IDS[id];
    if (!chip) continue;
    // The ESP32's bootloader is at 0x1000; one found at 0 is a bootloader-only or app-only file.
    if ((chip === "ESP32") !== (at === 0x1000)) continue;
    if (data.length < 0x10000 + 24 || data[0x10000] !== IMAGE_MAGIC) throw new Error("this ESP32 image has no app at 0x10000: is it the build's merged .bin?");
    return { chip };
  }
  throw new Error("this isn't a merged ESP32 image (no bootloader at 0x0 or 0x1000): was it built for this board?");
}

const PARTITION_TABLE = 0x8000;
const PARTITION_MAGIC = 0x50aa;

/** One region to write: flash address and bytes. */
export interface FlashRegion {
  address: number;
  data: Uint8Array;
}

/** The bytes without trailing 0xFF (erased flash), kept to a 4-byte multiple. */
function trimErased(d: Uint8Array): Uint8Array {
  let n = d.length;
  while (n > 0 && d[n - 1] === 0xff) n--;
  return d.subarray(0, Math.min(d.length, (n + 3) & ~3));
}

/**
 * What to write from a merged image, the way the Arduino IDE flashes an ESP32: the bootloader and the
 * partition table, the OTA data (so the board boots the first app slot), and the app. Everything else
 * stays as it is on the board, so the sketch's saved settings (NVS, Preferences) and files (SPIFFS,
 * LittleFS) survive a flash. The merged image carries those partitions as 0xFF padding, which would
 * erase them if it were written whole.
 */
export function esp32FlashRegions(data: Uint8Array): FlashRegion[] {
  const boot = data[0] === IMAGE_MAGIC ? 0 : 0x1000;
  const regions: FlashRegion[] = [{ address: boot, data: trimErased(data.subarray(boot, PARTITION_TABLE + 0x1000)) }];
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let app = false;
  for (let o = PARTITION_TABLE; o + 32 <= Math.min(data.length, PARTITION_TABLE + 0xc00); o += 32) {
    if (v.getUint16(o, true) !== PARTITION_MAGIC) break; // 0xFFFF ends the table, 0xEBEB is its MD5
    const type = data[o + 2]!;
    const subtype = data[o + 3]!;
    const offset = v.getUint32(o + 4, true);
    const size = v.getUint32(o + 8, true);
    const part = data.subarray(offset, Math.min(data.length, offset + size));
    if (type === 0x01 && subtype === 0x00 && part.length) regions.push({ address: offset, data: part }); // otadata (boot_app0: erased = boot app slot 0)
    else if (type === 0x00 && !app && part[0] === IMAGE_MAGIC) {
      regions.push({ address: offset, data: trimErased(part) });
      app = true;
    }
  }
  if (!app) throw new Error("this ESP32 image has no partition table or app in it: is it the build's merged .bin?");
  return regions;
}

/** Restart the sketch through the EN line (RTS). The port is left closed. */
export async function esp32Reset(port: SerialTransport) {
  if (!port.isOpen) await port.open(115200);
  await port.setSignals({ dtr: false, rts: true });
  await sleep(100);
  await port.setSignals({ rts: false });
  await port.close().catch(() => {});
  await sleep(1500); // let the sketch boot and open the display port
}
