import { describe, expect, it } from "vitest";
import { checkEsp32Image, esp32FlashRegions, esp32Reset } from "../src/esp32.ts";
import type { SerialTransport } from "../src/transport.ts";

/** A merged image: bootloader header at `boot` with the chip id, app header at 0x10000. */
function merged(boot: number, chipId: number, size = 0x10000 + 4096): Uint8Array {
  const d = new Uint8Array(size).fill(0xff);
  d[boot] = 0xe9;
  d[boot + 12] = chipId & 0xff;
  d[boot + 13] = chipId >> 8;
  d[0x10000] = 0xe9;
  return d;
}

describe("checkEsp32Image", () => {
  it("reads the chip from the bootloader header", () => {
    expect(checkEsp32Image(merged(0x1000, 0)).chip).toBe("ESP32");
    expect(checkEsp32Image(merged(0, 9)).chip).toBe("ESP32-S3");
  });
  it("refuses files that aren't a merged image", () => {
    expect(() => checkEsp32Image(new Uint8Array(100))).toThrow(/isn't a merged ESP32 image/);
    expect(() => checkEsp32Image(merged(0, 0))).toThrow(/isn't a merged ESP32 image/); // an ESP32 bootloader belongs at 0x1000
    expect(() => checkEsp32Image(merged(0x1000, 0, 0x2000))).toThrow(/no app/);
  });
});

describe("esp32Reset", () => {
  it("pulses EN through RTS with IO0 left high", async () => {
    const calls: string[] = [];
    let open = false;
    const port = {
      get isOpen() {
        return open;
      },
      open: async (b: number) => void (calls.push(`open ${b}`), (open = true)),
      close: async () => void (calls.push("close"), (open = false)),
      setSignals: async (s: { dtr?: boolean; rts?: boolean }) => void calls.push(JSON.stringify(s)),
    } as unknown as SerialTransport;
    await esp32Reset(port);
    expect(calls).toEqual(["open 115200", '{"dtr":false,"rts":true}', '{"rts":false}', "close"]);
  });
});

describe("esp32FlashRegions", () => {
  /** The default partition table: nvs 0x9000, otadata 0xe000, app0 0x10000, app1, spiffs. */
  function withTable(img: Uint8Array, appBytes = 1000) {
    const v = new DataView(img.buffer);
    const parts: [number, number, number, number][] = [
      [0x01, 0x02, 0x9000, 0x5000],
      [0x01, 0x00, 0xe000, 0x2000],
      [0x00, 0x10, 0x10000, 0x140000],
      [0x00, 0x11, 0x150000, 0x140000],
      [0x01, 0x82, 0x290000, 0x160000],
    ];
    parts.forEach(([type, sub, off, size], i) => {
      const o = 0x8000 + i * 32;
      v.setUint16(o, 0x50aa, true);
      img[o + 2] = type;
      img[o + 3] = sub;
      v.setUint32(o + 4, off, true);
      v.setUint32(o + 8, size, true);
    });
    img.fill(0x11, 0x10001, 0x10000 + appBytes);
    img[0x9000] = 0xff; // NVS is erased in the image: it must not be written
    return img;
  }
  it("writes the bootloader, partition table, OTA data and app, and leaves NVS and files alone", () => {
    const img = withTable(merged(0x1000, 0, 0x400000), 1001);
    const r = esp32FlashRegions(img);
    expect(r.map((x) => [x.address.toString(16), x.data.length])).toEqual([
      ["1000", 0x8000 + 4 * 32 + 12 - 0x1000], // up to the last table entry's size field (the fixture leaves labels erased)
      ["e000", 0x2000],
      ["10000", 1004],
    ]);
  });
  it("starts at 0 for an ESP32-S3", () => {
    expect(esp32FlashRegions(withTable(merged(0, 9, 0x20000)))[0]!.address).toBe(0);
  });
  it("needs a partition table", () => {
    expect(() => esp32FlashRegions(merged(0x1000, 0))).toThrow(/no partition table/);
  });
});
