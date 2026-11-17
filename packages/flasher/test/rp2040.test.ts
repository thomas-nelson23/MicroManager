import { describe, expect, it } from "vitest";
import { checkUf2, RP2040_FAMILY } from "../src/rp2040.ts";

function uf2(blocks: number, family = RP2040_FAMILY): Uint8Array {
  const out = new Uint8Array(blocks * 512);
  const v = new DataView(out.buffer);
  for (let i = 0; i < blocks; i++) {
    const o = i * 512;
    v.setUint32(o, 0x0a324655, true);
    v.setUint32(o + 4, 0x9e5d5157, true);
    v.setUint32(o + 8, 0x2000, true);
    v.setUint32(o + 12, 0x10000000 + i * 256, true);
    v.setUint32(o + 16, 256, true);
    v.setUint32(o + 20, i, true);
    v.setUint32(o + 24, blocks, true);
    v.setUint32(o + 28, family, true);
    v.setUint32(o + 508, 0x0ab16f30, true);
  }
  return out;
}

describe("checkUf2", () => {
  it("accepts an RP2040 image", () => {
    expect(checkUf2(uf2(3))).toBe(3);
  });
  it("rejects a hex file, a truncated image and another chip's image", () => {
    expect(() => checkUf2(new TextEncoder().encode(":00000001FF\n"))).toThrow(/isn't a UF2/);
    expect(() => checkUf2(uf2(3).subarray(0, 1024))).toThrow(/incomplete/);
    expect(() => checkUf2(uf2(2, 0xe48bff59))).toThrow(/another chip/);
  });
});
