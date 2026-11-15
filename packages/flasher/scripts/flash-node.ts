/** Flash a Nano Every from Node: npx tsx scripts/flash-node.ts /dev/ttyACM0 sketch.hex */
import { readFileSync } from "node:fs";
import { parseIntelHex, flashNanoEvery } from "../src/index.ts";
import { NodeSerialTransport } from "../src/node-transport.ts";

const [path, hexFile] = process.argv.slice(2);
if (!path || !hexFile) {
  console.error("usage: flash-node.ts <port> <file.hex>");
  process.exit(2);
}
const img = parseIntelHex(readFileSync(hexFile, "utf8"));
console.log(`image: ${img.data.length} bytes from 0x${img.start.toString(16)}`);
const t0 = Date.now();
let last = "";
await flashNanoEvery(
  new NodeSerialTransport(path),
  img,
  (p) => {
    const line = p.total ? `${p.stage} ${p.done}/${p.total}` : p.stage;
    if (p.stage !== last || p.done === p.total) console.log(line);
    last = p.stage;
  },
  (s) => console.log("  " + s),
);
console.log(`OK in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
