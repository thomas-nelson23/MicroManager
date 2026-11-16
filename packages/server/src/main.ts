/** HTTP API + WebSocket server. */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import fs from "node:fs/promises";
import path from "node:path";
import { WebSocketServer } from "ws";
import { interrupt, sendMessage } from "./chat.ts";
import { config } from "./config.ts";
import { hubFor } from "./hub.ts";
import { BOARDS, boardById } from "./boards.ts";
import { createProject, listBuilds, listFiles, listProjects, markFlashed, projectDir, readMeta, safePath, setBoard, writeMeta } from "./projects.ts";

const app = new Hono();

app.onError((err, c) => c.json({ error: err.message }, /bad project id|outside the project|ENOENT/.test(err.message) ? 404 : 500));

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/boards", (c) => c.json(BOARDS));

app.get("/api/projects", async (c) => c.json(await listProjects()));

app.post("/api/projects", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const meta = await createProject(String(body.title ?? "New project"), String(body.description ?? ""), typeof body.board === "string" ? body.board : undefined);
  return c.json(meta, 201);
});

app.get("/api/projects/:id", async (c) => {
  const id = c.req.param("id");
  const [meta, files, builds] = await Promise.all([readMeta(id), listFiles(id), listBuilds(id)]);
  const read = (rel: string) => fs.readFile(safePath(id, rel), "utf8").catch(() => "");
  const [hmi, hardware, sketch] = await Promise.all([read("nextion/hmi.txt"), read("hardware.md"), read("sketch/sketch.ino")]);
  // font index -> pixel height (byte 7 of a .zi header)
  const fonts: { index: number; height: number }[] = [];
  for (const f of files) {
    const m = /^nextion\/font\/(\d+)\.zi$/.exec(f.path);
    if (!m) continue;
    const head = await fs.readFile(safePath(id, f.path)).then((b) => b.subarray(0, 8), () => null);
    if (head && head.length === 8) fonts.push({ index: Number(m[1]), height: head[7]! });
  }
  return c.json({ meta, files, builds, hmi, hardware, sketch, fonts: fonts.sort((a, b) => a.index - b.index), busy: hubFor(id).busy });
});

app.patch("/api/projects/:id", async (c) => {
  const meta = await readMeta(c.req.param("id"));
  const body = await c.req.json();
  if (typeof body.title === "string") meta.title = body.title.slice(0, 80);
  if (typeof body.description === "string") meta.description = body.description.slice(0, 400);
  if (typeof body.board === "string" && body.board) {
    const board = boardById(body.board);
    if (!board) return c.json({ error: `unknown board: ${body.board}` }, 400);
    if (hubFor(meta.id).busy) return c.json({ error: "Claude is working on this project; try again when it's done" }, 409);
    if (board.fqbn !== meta.board.fqbn) {
      await setBoard(meta, board);
      hubFor(meta.id).broadcast({ type: "project_changed" });
      return c.json(meta);
    }
  }
  await writeMeta(meta);
  return c.json(meta);
});

app.post("/api/projects/:id/builds/:n/flashed", async (c) => {
  const { id, n } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  await markFlashed(id, Number(n), body.sketch === true, body.screen === true);
  hubFor(id).broadcast({ type: "project_changed" });
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

const wss = new WebSocketServer({ noServer: true });
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
      if (msg.type === "send" && msg.text.trim()) void sendMessage(id, msg.text.trim());
      else if (msg.type === "interrupt") interrupt(id);
    };
    await hub.addSocket(ws);
  });
});
