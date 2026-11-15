/** Debug: same as debug-nudge but waits with a single awaited read (like the flasher). */
import { NodeSerialTransport } from "../src/node-transport.ts";
import { enterUpdiMode, encodeFrame } from "../src/index.ts";
if (process.argv[2] === "tick") setInterval(() => {}, 10);
const t = new NodeSerialTransport("/dev/ttyACM0");
await enterUpdiMode(t);
await t.open(115200);
await t.setSignals({ dtr: true });
const res: string[] = [];
for (const [seq, body] of [[0, [1]], [1, [2, 3, 6]], [2, [0x0f]]] as const) {
  const t0 = Date.now();
  await t.write(encodeFrame(seq, Uint8Array.from(body)));
  try { await t.rx.read(11, 3000); res.push(`seq${seq}:${Date.now() - t0}ms`); } catch { res.push(`seq${seq}:none`); }
  t.rx.take();
}
console.log(res.join("  "));
await t.close();
process.exit(0);
