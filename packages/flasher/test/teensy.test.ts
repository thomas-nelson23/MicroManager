import { describe, expect, it } from "vitest";
import { parseIntelHex } from "../src/ihex.ts";
import { flashTeensy, halfKayReport, teensyBlocks, TEENSY41 } from "../src/teensy.ts";

/** Build an Intel HEX file with an extended linear address record. */
function hexFile(base: number, data: Uint8Array): string {
  const rec = (addr: number, type: number, payload: number[]) => {
    const b = [payload.length, (addr >> 8) & 0xff, addr & 0xff, type, ...payload];
    const sum = (0x100 - (b.reduce((a, x) => a + x, 0) & 0xff)) & 0xff;
    return ":" + [...b, sum].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  };
  const lines = [rec(0, 0x04, [(base >>> 24) & 0xff, (base >>> 16) & 0xff])];
  for (let i = 0; i < data.length; i += 16) lines.push(rec((base + i) & 0xffff, 0x00, [...data.subarray(i, i + 16)]));
  lines.push(rec(0, 0x01, []));
  return lines.join("\n");
}

describe("Teensy 4.1 HalfKay", () => {
  it("maps the FlexSPI base to offset 0 and skips blank blocks", () => {
    const data = new Uint8Array(3 * 1024).fill(0xff);
    data.set([1, 2, 3], 0);
    data.set([9], 2 * 1024 + 5); // block 1 stays blank
    const img = parseIntelHex(hexFile(0x60000000, data));
    expect(img.start).toBe(0x60000000);
    const blocks = teensyBlocks(img);
    expect(blocks.map((b) => b.offset)).toEqual([0, 2048]);
    expect(blocks[1]!.data[5]).toBe(9);
  });

  it("always writes block 0, which erases the flash", () => {
    const data = new Uint8Array(16).fill(0x42);
    const blocks = teensyBlocks(parseIntelHex(hexFile(0x60000000 + 4096, data)));
    expect(blocks.map((b) => b.offset)).toEqual([0, 4096]);
    expect(blocks[0]!.data.every((b) => b === 0xff)).toBe(true);
  });

  it("rejects a hex built for another board", () => {
    const img = parseIntelHex(hexFile(0x20000000, new Uint8Array(16)));
    expect(() => teensyBlocks(img)).toThrow(/doesn't fit/);
  });

  it("puts the 24-bit offset in a 64-byte header", () => {
    const r = halfKayReport(0x123400, new Uint8Array(1024).fill(7));
    expect(r.length).toBe(64 + TEENSY41.blockSize);
    expect([...r.subarray(0, 4)]).toEqual([0x00, 0x34, 0x12, 0]);
    expect(r[64]).toBe(7);
  });

  it("writes every block, retries refused reports, then reboots", async () => {
    const data = new Uint8Array(2048).fill(0x11);
    const sent: Uint8Array[] = [];
    let refuse = 2;
    await flashTeensy(
      {
        async send(r) {
          if (refuse-- > 0) throw new Error("busy erasing");
          sent.push(r);
        },
      },
      parseIntelHex(hexFile(0x60000000, data)),
    );
    expect(sent.map((r) => r[1])).toEqual([0, 4, 0xff]);
    expect([...sent[2]!.subarray(0, 3)]).toEqual([0xff, 0xff, 0xff]);
  });
});
