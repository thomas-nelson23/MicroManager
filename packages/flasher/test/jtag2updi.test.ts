import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { crc16, encodeFrame, ATMEGA4809 } from "../src/jtag2updi.ts";
import { parseIntelHex, pages } from "../src/ihex.ts";

const hex = (s: string) => Uint8Array.from(s.trim().split(/\s+/).map((x) => parseInt(x, 16)));

describe("jtag2updi framing (frames captured from avrdude)", () => {
  it("sign-on", () => {
    expect(encodeFrame(0, hex("01"))).toEqual(hex("1b 00 00 01 00 00 00 0e 01 f3 97"));
  });
  it("set parameter", () => {
    expect(encodeFrame(1, hex("02 03 06"))).toEqual(hex("1b 01 00 03 00 00 00 0e 02 03 06 24 31"));
  });
  it("read signature byte", () => {
    expect(encodeFrame(11, hex("05 b4 01 00 00 00 00 11 00 00"))).toEqual(
      hex("1b 0b 00 0a 00 00 00 0e 05 b4 01 00 00 00 00 11 00 00 1a d4"),
    );
  });
  it("fuse write", () => {
    expect(encodeFrame(0x2a, hex("04 b2 01 00 00 00 82 12 00 00 01"))).toEqual(
      hex("1b 2a 00 0b 00 00 00 0e 04 b2 01 00 00 00 82 12 00 00 01 2d 39"),
    );
  });
  it("crc of empty input", () => {
    expect(crc16(new Uint8Array())).toBe(0xffff);
  });
  it("device descriptor matches the one avrdude sent", () => {
    const want = new Uint8Array(readFileSync(new URL("../../../spike/devdescr-atmega4809.bin", import.meta.url)));
    const got = new Uint8Array(299);
    got[0] = 0x0c;
    for (const [o, v] of ATMEGA4809.descriptor) got[1 + o] = v;
    expect(got).toEqual(want);
  });
});

describe("intel hex", () => {
  it("parses data, extended address and checksum", () => {
    const img = parseIntelHex(":0400000001020304F2\n:020000040001F9\n:0100000055AA\n:00000001FF\n");
    expect(img.start).toBe(0);
    expect(img.data.length).toBe(0x10001);
    expect([...img.data.subarray(0, 4)]).toEqual([1, 2, 3, 4]);
    expect(img.data[0x10000]).toBe(0x55);
    expect(img.data[4]).toBe(0xff);
  });
  it("rejects a bad checksum", () => {
    expect(() => parseIntelHex(":0400000001020304F3\n")).toThrow(/checksum/);
  });
  it("pages skip blank pages and pad partial ones", () => {
    const img = { start: 2, data: Uint8Array.of(1, 2, 3) };
    const p = pages(img, 4);
    expect(p.map((x) => x.address)).toEqual([0, 4]);
    expect([...p[0]!.data]).toEqual([0xff, 0xff, 1, 2]);
    expect([...p[1]!.data]).toEqual([3, 0xff, 0xff, 0xff]);
  });
});
