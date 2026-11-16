/** Intel HEX parser producing a flat image (gaps filled with 0xFF). Supports record types 00, 01, 02, 04. */
export interface HexImage {
  /** Lowest address with data. */
  start: number;
  /** Image bytes from `start`, gaps are 0xFF. */
  data: Uint8Array;
}

export function parseIntelHex(text: string): HexImage {
  const bytes = new Map<number, number>();
  let base = 0;
  let sawEof = false;
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (sawEof) return;
    if (line[0] !== ":" || line.length < 11 || (line.length - 1) % 2) {
      throw new Error(`hex line ${i + 1}: malformed`);
    }
    const rec = new Uint8Array((line.length - 1) / 2);
    for (let k = 0; k < rec.length; k++) rec[k] = parseInt(line.substr(1 + 2 * k, 2), 16);
    const len = rec[0]!;
    if (rec.length !== len + 5) throw new Error(`hex line ${i + 1}: length mismatch`);
    let sum = 0;
    for (const b of rec) sum = (sum + b) & 0xff;
    if (sum !== 0) throw new Error(`hex line ${i + 1}: bad checksum`);
    const addr = (rec[1]! << 8) | rec[2]!;
    const type = rec[3]!;
    const payload = rec.subarray(4, 4 + len);
    switch (type) {
      case 0x00:
        payload.forEach((b, k) => bytes.set(base + addr + k, b));
        break;
      case 0x01:
        sawEof = true;
        break;
      case 0x02:
        base = ((payload[0]! << 8) | payload[1]!) << 4;
        break;
      case 0x04:
        base = ((payload[0]! << 8) | payload[1]!) << 16;
        break;
      case 0x03:
      case 0x05:
        break; // start address records: irrelevant for flashing
      default:
        throw new Error(`hex line ${i + 1}: unsupported record type ${type}`);
    }
  });
  if (!bytes.size) throw new Error("hex file contains no data");
  // a loop, not Math.min(...keys): a Teensy image has too many bytes to spread into arguments
  let start = Infinity;
  let end = -Infinity;
  for (const a of bytes.keys()) {
    if (a < start) start = a;
    if (a >= end) end = a + 1;
  }
  const data = new Uint8Array(end - start).fill(0xff);
  for (const [a, b] of bytes) data[a - start] = b;
  return { start, data };
}

/** Split an image into pages of `pageSize`, aligned to page boundaries, skipping pages that are all 0xFF. */
export function pages(img: HexImage, pageSize: number): Array<{ address: number; data: Uint8Array }> {
  const out: Array<{ address: number; data: Uint8Array }> = [];
  const first = Math.floor(img.start / pageSize) * pageSize;
  const end = img.start + img.data.length;
  for (let a = first; a < end; a += pageSize) {
    const page = new Uint8Array(pageSize).fill(0xff);
    for (let k = 0; k < pageSize; k++) {
      const src = a + k - img.start;
      if (src >= 0 && src < img.data.length) page[k] = img.data[src]!;
    }
    if (page.some((b) => b !== 0xff)) out.push({ address: a, data: page });
  }
  return out;
}
