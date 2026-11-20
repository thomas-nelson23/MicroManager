/** HTTP API + WebSocket server. */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { WebSocketServer } from "ws";
import { build } from "./builds.ts";
import { interrupt, newConversation, sendMessage } from "./chat.ts";
import { config } from "./config.ts";
import { applyAttrChange, type AttrChange, HmiEditError } from "./hmi-edit.ts";
import { hubFor } from "./hub.ts";
import { projectFonts } from "./layout-lint.ts";
import { BOARDS, boardById, isPiBoard } from "./boards.ts";
import { deployToPi, piDisplay, piHost, piLog, validPiHost } from "./pi.ts";
import { DISPLAYS, displayByModel } from "./displays.ts";
import {
  createProject,
  deleteProject,
  duplicateProject,
  listBuilds,
  listFiles,
  listProjectSummaries,
  mainSource,
  markFlashed,
  projectDir,
  readMeta,
  readWiring,
  safePath,
  setBoard,
  setDisplay,
  writeMeta,
} from "./projects.ts";

const app = new Hono();

app.onError((err, c) => c.json({ error: err.message }, /bad project id|outside the project|ENOENT/.test(err.message) ? 404 : 500));

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/boards", (c) => c.json(BOARDS));

app.get("/api/displays", (c) => c.json(DISPLAYS));

app.get("/api/config", (c) => c.json({ publicUrl: config.publicUrl, piHost: config.pi.host }));

app.get("/api/projects", async (c) => c.json(await listProjectSummaries()));

app.post("/api/projects", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const meta = await createProject(String(body.title ?? "New project"), String(body.description ?? ""), typeof body.board === "string" ? body.board : undefined, typeof body.display === "string" ? body.display : undefined);
  return c.json(meta, 201);
});

app.get("/api/projects/:id", async (c) => {
  const id = c.req.param("id");
  const [{ sessionId: _session, sessionAt: _at, sessionContext: _ctx, ...meta }, files, builds, wiring] = await Promise.all([readMeta(id), listFiles(id), listBuilds(id), readWiring(id)]);
  const read = (rel: string) => fs.readFile(safePath(id, rel), "utf8").catch(() => "");
  const [hmi, hardware, sketch] = await Promise.all([read("nextion/hmi.txt"), read("hardware.md"), read(mainSource(meta))]);
  const fonts = await projectFonts(id);
  return c.json({ meta, files, builds, hmi, hardware, sketch, wiring: wiring.wiring, wiringSource: wiring.source, wiringError: wiring.error, fonts, busy: hubFor(id).busy });
});

app.patch("/api/projects/:id", async (c) => {
  const meta = await readMeta(c.req.param("id"));
  const body = await c.req.json();
  if (typeof body.title === "string") meta.title = body.title.slice(0, 80);
  if (typeof body.description === "string") meta.description = body.description.slice(0, 400);
  if (typeof body.piHost === "string") {
    const h = body.piHost.trim();
    if (h && !validPiHost(h)) return c.json({ error: `"${h}" isn't a Pi address; use user@host, e.g. pi@raspberrypi.local` }, 400);
    if (h) meta.pi = { ...meta.pi, host: h };
    else delete meta.pi;
  }
  const board = typeof body.board === "string" && body.board ? boardById(body.board) : undefined;
  const display = typeof body.display === "string" && body.display ? displayByModel(body.display) : undefined;
  if (typeof body.board === "string" && body.board && !board) return c.json({ error: `unknown board: ${body.board}` }, 400);
  if (typeof body.display === "string" && body.display && !display) return c.json({ error: `unknown display: ${body.display}` }, 400);
  const boardChanges = board && board.fqbn !== meta.board.fqbn;
  const displayChanges = display && display.model !== meta.display.model;
  if ((boardChanges || displayChanges) && hubFor(meta.id).busy) return c.json({ error: "Claude is working on this project; try again when it's done" }, 409);
  if (boardChanges) {
    await setBoard(meta, board);
    await hubFor(meta.id).emit({ kind: "notice", id: randomUUID(), text: `Board changed to ${board.name}.` });
  }
  if (displayChanges) {
    await setDisplay(meta, display);
    await hubFor(meta.id).emit({ kind: "notice", id: randomUUID(), text: `Display changed to ${display.model} (${display.width} × ${display.height}).` });
  }
  if (!boardChanges && !displayChanges) await writeMeta(meta);
  hubFor(meta.id).broadcast({ type: "project_changed" });
  const { sessionId: _session, ...pub } = meta;
  return c.json(pub);
});

app.delete("/api/projects/:id", async (c) => {
  const id = c.req.param("id");
  await readMeta(id);
  if (hubFor(id).busy) return c.json({ error: "Claude is working on this project; try again when it's done" }, 409);
  await deleteProject(id);
  return c.json({ ok: true });
});

app.post("/api/projects/:id/duplicate", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const src = await readMeta(c.req.param("id"));
  const meta = await duplicateProject(src.id, String(body.title ?? `${src.title} copy`).slice(0, 80));
  return c.json(meta, 201);
});

app.post("/api/projects/:id/conversation", async (c) => {
  const id = c.req.param("id");
  await readMeta(id);
  if (hubFor(id).busy) return c.json({ error: "Claude is working on this project; try again when it's done" }, 409);
  await newConversation(id);
  return c.json({ ok: true });
});

const RAW_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
app.get("/api/projects/:id/upload/:file", async (c) => {
  const { id, file } = c.req.param();
  const type = RAW_TYPES[path.extname(file).toLowerCase()];
  if (!/^[\w.-]+$/.test(file) || !type) return c.json({ error: "not found" }, 404);
  return c.body(await fs.readFile(path.join(projectDir(id), "uploads", file)), 200, { "content-type": type, "cache-control": "private, max-age=86400" });
});

/** Build the project as it is, without Claude: for a rebuild after a board or display switch, or a retry. */
const building = new Set<string>();
app.post("/api/projects/:id/builds", async (c) => {
  const id = c.req.param("id");
  await readMeta(id);
  const body = await c.req.json().catch(() => ({}));
  const target = body.target === "sketch" || body.target === "screen" ? body.target : "both";
  if (hubFor(id).busy || building.has(id)) return c.json({ error: "A build or Claude is already running for this project; try again when it's done" }, 409);
  building.add(id);
  try {
    const rec = await build(id, target, typeof body.label === "string" && body.label ? body.label : "rebuild");
    return c.json(rec);
  } finally {
    building.delete(id);
    hubFor(id).broadcast({ type: "project_changed" });
  }
});

app.post("/api/projects/:id/builds/:n/flashed", async (c) => {
  const { id, n } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  await markFlashed(id, Number(n), body.sketch === true, body.screen === true);
  hubFor(id).broadcast({ type: "project_changed" });
  return c.json({ ok: true });
});

/** Raspberry Pi projects: deploy a build over SSH (the browser isn't involved). */
app.post("/api/projects/:id/builds/:n/deploy", async (c) => {
  const { id, n } = c.req.param();
  const meta = await readMeta(id);
  if (!isPiBoard(meta.board.fqbn)) return c.json({ error: "only Raspberry Pi projects deploy from the server" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const parts = body.parts === "sketch" || body.parts === "screen" ? body.parts : "both";
  const b = (await listBuilds(id)).find((x) => x.n === Number(n));
  if (!b) return c.json({ error: "no such build" }, 404);
  const dir = path.join(projectDir(id), "builds", String(b.n));
  const app = parts !== "screen" && b.sketch?.ok && b.sketch.file ? path.join(dir, b.sketch.file) : undefined;
  const tft = parts !== "sketch" && b.screen?.ok && b.screen.file ? path.join(dir, b.screen.file) : undefined;
  if (!app && !tft) return c.json({ error: `Build #${b.n} has nothing to deploy for "${parts}".` }, 400);
  const r = await deployToPi(meta, { app, tft });
  if (r.ok) await markFlashed(id, b.n, !!app, !!tft);
  hubFor(id).broadcast({ type: "project_changed" });
  return c.json({ status: r.ok ? "done" : "failed", message: r.message });
});

app.post("/api/projects/:id/pi/run", async (c) => {
  const meta = await readMeta(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const commands = Array.isArray(body.commands) ? body.commands.filter((x: unknown) => typeof x === "string").slice(0, 40) : [];
  const listen = Math.max(0, Math.min(30, Number(body.listen) || 0));
  return c.json(await piDisplay(meta, commands, listen));
});

app.get("/api/projects/:id/pi/log", async (c) => {
  const meta = await readMeta(c.req.param("id"));
  return c.json({ ...(await piLog(meta, Number(c.req.query("lines") ?? 60))), host: piHost(meta) });
});

app.post("/api/projects/:id/screen/attrs", async (c) => {
  const id = c.req.param("id");
  const hub = hubFor(id);
  if (hub.busy) return c.json({ error: "Claude is working on this project; save again when it's done" }, 409);
  const body = (await c.req.json().catch(() => ({}))) as Partial<AttrChange>;
  if (typeof body.page !== "string" || !body.attrs || typeof body.attrs !== "object") return c.json({ error: "page and attrs are required" }, 400);
  const change: AttrChange = { page: body.page, name: typeof body.name === "string" ? body.name : undefined, attrs: body.attrs };
  const file = safePath(id, "nextion/hmi.txt");
  let out: string;
  try {
    out = applyAttrChange(await fs.readFile(file, "utf8"), change);
  } catch (e) {
    if (e instanceof HmiEditError || e instanceof SyntaxError) return c.json({ error: e.message }, 400);
    throw e;
  }
  await fs.writeFile(file, out);
  hub.screenEdits.add(`${change.page}${change.name ? `.${change.name}` : ""}: ${Object.keys(change.attrs).join(", ")}`);
  hub.broadcast({ type: "project_changed" });
  return c.json({ ok: true });
});

app.get("/api/projects/:id/file", async (c) => {
  const p = safePath(c.req.param("id"), c.req.query("path") ?? "");
  return c.text(await fs.readFile(p, "utf8"));
});

app.get("/api/projects/:id/builds/:n/:file", async (c) => {
  const { id, n, file } = c.req.param();
  if (!/^\d+$/.test(n) || !/^[\w.-]+$/.test(file)) return c.json({ error: "not found" }, 404);
  const data = await fs.readFile(path.join(projectDir(id), "builds", n, file));
  return c.body(data, 200, { "content-type": "application/octet-stream", "cache-control": "no-store" });
});

if (config.webDist) {
  const dist = config.webDist;
  const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2", ".png": "image/png" };
  app.get("*", async (c) => {
    const rel = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, "");
    let file = path.resolve(dist, rel);
    if (!file.startsWith(dist) || !(await fs.stat(file).then((s) => s.isFile(), () => false))) file = path.join(dist, "index.html");
    return c.body(await fs.readFile(file), 200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  });
}

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`nextion-arduino server on http://${config.host}:${info.port} · data ${config.dataDir}`);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
server.on("upgrade", (req, socket, head) => {
  const m = /^\/api\/projects\/([a-z0-9-]+)\/ws$/.exec(new URL(req.url ?? "", "http://x").pathname);
  if (!m) return socket.destroy();
  const id = m[1]!;
  wss.handleUpgrade(req, socket, head, async (ws) => {
    try {
      await readMeta(id);
    } catch {
      ws.close(4404, "no such project");
      return;
    }
    const hub = hubFor(id);
    hub.onClientMessage = (msg) => {
      if (msg.type === "send" && (msg.text.trim() || msg.images?.length)) void sendMessage(id, msg.text.trim(), msg.images, { strong: msg.strong === true });
      else if (msg.type === "interrupt") interrupt(id);
    };
    await hub.addSocket(ws);
  });
});
