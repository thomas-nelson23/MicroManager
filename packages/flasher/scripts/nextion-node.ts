/**
 * Nextion from Node through the passthrough:
 *   npx tsx scripts/nextion-node.ts /dev/ttyACM0 probe
 *   npx tsx scripts/nextion-node.ts /dev/ttyACM0 upload file.tft [expectedModelPrefix]
 *   npx tsx scripts/nextion-node.ts /dev/ttyACM0 cmd 'get t0.txt' 'page 1'
 */
import { readFileSync } from "node:fs";
import { openDisplay, resetBoard } from "../src/nextion.ts";
import { NodeSerialTransport } from "../src/node-transport.ts";

const [path, action, ...args] = process.argv.slice(2);
if (!path || !action) {
  console.error("usage: nextion-node.ts <port> probe|upload|cmd ...");
  process.exit(2);
}
const port = new NodeSerialTransport(path);
const { nex, info } = await openDisplay(port);
console.log("display:", info.raw);
if (action === "upload") {
  const [file, expect] = args;
  if (!file) throw new Error("upload needs a .tft file");
  if (expect && !info.model.startsWith(expect)) throw new Error(`model mismatch: display is ${info.model}, expected ${expect}`);
  const tft = new Uint8Array(readFileSync(file));
  let lastPct = -1;
  await nex.uploadTft(tft, {
    progress: (p) => {
      const pct = Math.floor(((p.done ?? 0) * 100) / (p.total ?? 1));
      if (pct >= lastPct + 10 || p.done === p.total) {
        console.log(`upload ${pct}% ${p.message ?? ""}`);
        lastPct = pct;
      }
    },
  });
  await port.close();
  console.log("OK: upload complete; restarting the board");
  await resetBoard(port);
} else if (action === "cmd") {
  await nex.command("bkcmd=3");
  for (const c of args) console.log(JSON.stringify({ cmd: c, reply: await nex.command(c) }));
}
await port.close();
process.exit(0);
