import { parseIntelHex, flashNanoEvery, openDisplay, resetBoard, type Progress } from "@nextion-arduino/flasher";
import { WebSerialTransport } from "@nextion-arduino/flasher/web";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $<HTMLPreElement>("log");
const bar = $<HTMLProgressElement>("bar");
const statusEl = $("status");
let port: WebSerialTransport | null = null;
let busy = false;

function log(s: string, cls?: string) {
  const line = document.createElement("div");
  line.textContent = `${new Date().toLocaleTimeString()}  ${s}`;
  if (cls) line.className = cls;
  logEl.append(line);
  logEl.scrollTop = logEl.scrollHeight;
}

const progress: Progress = (p) => {
  if (p.total) {
    bar.max = p.total;
    bar.value = p.done ?? 0;
  }
  if (!p.total || p.done === 0) log(`${p.stage}${p.message ? ": " + p.message : ""}`);
};

async function run(name: string, fn: () => Promise<void>) {
  if (busy) return;
  if (!port) {
    log("Choose a serial port first.", "err");
    return;
  }
  busy = true;
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  const t0 = performance.now();
  try {
    await fn();
    log(`${name}: OK in ${((performance.now() - t0) / 1000).toFixed(1)} s`, "ok");
  } catch (e) {
    log(`${name}: ${e instanceof Error ? e.message : String(e)}`, "err");
    console.error(e);
    try {
      await port.close();
    } catch {
      /* ignore */
    }
  } finally {
    busy = false;
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}

async function flashHex(text: string, label: string) {
  const img = parseIntelHex(text);
  log(`${label}: ${img.data.length} bytes`);
  await flashNanoEvery(port!, img, progress, (s) => log("  " + s));
}

async function uploadTft(bytes: Uint8Array) {
  const { nex, info } = await openDisplay(port!);
  log(`display: ${info.raw}`);
  await nex.uploadTft(bytes, { progress: (p) => { bar.max = p.total ?? 1; bar.value = p.done ?? 0; } });
  await port!.close();
  log("upload complete; restarting the board");
  await resetBoard(port!);
}

$("pick").onclick = async () => {
  try {
    if (port?.isOpen) await port.close();
    port = await WebSerialTransport.request();
    const info = port.port.getInfo();
    statusEl.textContent = `Port selected (USB ${info.usbVendorId?.toString(16) ?? "?"}:${info.usbProductId?.toString(16) ?? "?"})`;
    log(statusEl.textContent);
  } catch (e) {
    log(e instanceof Error ? e.message : String(e), "err");
  }
};

document.querySelectorAll<HTMLButtonElement>("button[data-hex]").forEach((b) => {
  b.onclick = () =>
    run(`flash ${b.dataset.hex}`, async () => {
      const r = await fetch(`/${b.dataset.hex}`);
      if (!r.ok) throw new Error(`could not load ${b.dataset.hex}`);
      await flashHex(await r.text(), b.dataset.hex!);
    });
});

$<HTMLInputElement>("hexFile").onchange = (ev) => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (f) run(`flash ${f.name}`, async () => flashHex(await f.text(), f.name));
};

$("readSerial").onclick = () =>
  run("read serial", async () => {
    await port!.open(115200);
    await new Promise((r) => setTimeout(r, 3000));
    const text = new TextDecoder().decode(port!.rx.take());
    await port!.close();
    log(text.trim() ? `received:\n${text.trim()}` : "nothing received");
  });

$("probe").onclick = () =>
  run("connect", async () => {
    const { info } = await openDisplay(port!);
    log(`display: ${info.raw}`);
    log(`model ${info.model}, firmware ${info.firmware}`);
    await port!.close();
  });

$("uploadDemo").onclick = () =>
  run("upload demo.tft", async () => {
    const r = await fetch("/demo.tft");
    if (!r.ok) throw new Error("could not load demo.tft");
    await uploadTft(new Uint8Array(await r.arrayBuffer()));
  });

$<HTMLInputElement>("tftFile").onchange = (ev) => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (f) run(`upload ${f.name}`, async () => uploadTft(new Uint8Array(await f.arrayBuffer())));
};

$("send").onclick = () =>
  run("command", async () => {
    const { nex } = await openDisplay(port!);
    await nex.command("bkcmd=3");
    const c = $<HTMLInputElement>("cmd").value;
    log(`${c} -> ${JSON.stringify(await nex.command(c))}`);
    await port!.close();
  });

if (!("serial" in navigator)) log("This browser has no Web Serial. Use Chrome, Edge or Brave on localhost or HTTPS.", "err");
