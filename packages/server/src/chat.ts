/** Chat with Claude (Claude Agent SDK) inside a project folder, with build/flash/display tools. */
import { createSdkMcpServer, query, tool, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { build } from "./builds.ts";
import { config } from "./config.ts";
import { hubFor, type ProjectHub } from "./hub.ts";
import type { ChatEvent, ClientMessage } from "./protocol.ts";
import { listBuilds, markFlashed, projectDir, readMeta, writeMeta } from "./projects.ts";

const GUIDE_DIR = path.join(config.serverRoot, "guide");
const GUIDE = fs.readFileSync(path.join(GUIDE_DIR, "GUIDE.md"), "utf8");

const text = (s: string, isError = false) => ({ content: [{ type: "text" as const, text: s }], ...(isError ? { isError: true } : {}) });

function buildSummary(b: Awaited<ReturnType<typeof build>>): string {
  const lines = [`Build #${b.n}`];
  if (b.sketch) {
    lines.push(
      b.sketch.ok
        ? `sketch: OK${b.sketch.fromBuild ? ` (unchanged, from #${b.sketch.fromBuild})` : ""}${b.sketch.bytes ? ` · ${b.sketch.bytes} of ${b.sketch.max} bytes` : ""}`
        : `sketch: FAILED\n${b.sketch.error}`,
    );
  }
  if (b.screen) {
    lines.push(
      b.screen.ok
        ? `screen: OK${b.screen.fromBuild ? ` (unchanged, from #${b.screen.fromBuild})` : ""} · ${b.screen.bytes} bytes`
        : `screen: FAILED\n${b.screen.error}`,
    );
  }
  return lines.join("\n");
}

function benchServer(projectId: string, hub: ProjectHub) {
  const dir = projectDir(projectId);
  return createSdkMcpServer({
    name: "bench",
    version: "0.1.0",
    tools: [
      tool(
        "check_screen",
        "Validate nextion/hmi.txt without building: JSON shape, component types, attribute names, text lengths, event names, and that every obj.attr in event code exists. Fast and local.",
        {},
        async () => {
          const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nxcheck-"));
          const meta = await readMeta(projectId);
          const out = await new Promise<{ code: number; out: string }>((resolve) => {
            const p = spawn("python3", ["-I", path.join(config.serverRoot, "nextion", "nxprep.py"), path.join(dir, "nextion"), path.join(tmp, "hmi.txt"), "--jobname", projectId, "--jobroot", "C:\\check"], {
              env: { ...process.env, DISPLAY_SERIES: meta.display.series, DISPLAY_MODEL: meta.display.model },
            });
            let o = "";
            p.stdout.on("data", (d) => (o += d));
            p.stderr.on("data", (d) => (o += d));
            p.on("close", (code) => resolve({ code: code ?? 1, out: o }));
          });
          fs.rmSync(tmp, { recursive: true, force: true });
          return text(out.out.trim() || "OK", out.code !== 0);
        },
      ),
      tool(
        "build",
        "Compile the project into a new numbered build: the sketch with arduino-cli and/or the screen with Nextion Editor. The half you don't rebuild is carried over from the previous build, so every build can be flashed whole.",
        {
          target: z.enum(["sketch", "screen", "both"]).describe("What changed and needs compiling"),
          label: z.string().describe("A few words naming the change, e.g. 'fan override'"),
        },
        async ({ target, label }) => {
          const b = await build(projectId, target, label);
          hub.broadcast({ type: "project_changed" });
          const ok = (!b.sketch || b.sketch.ok) && (!b.screen || b.screen.ok);
          return text(buildSummary(b), !ok);
        },
      ),
      tool(
        "flash",
        "Ask the person to flash a build to their device. Their page shows a Flash button; this waits (up to 15 minutes) and returns what happened. The sketch goes to the Arduino; the screen is uploaded to the display through NexPass in that sketch.",
        {
          build: z.number().int().optional().describe("Build number; defaults to the latest"),
          parts: z.enum(["both", "sketch", "screen"]).default("both"),
        },
        async ({ build: n, parts }) => {
          if (!hub.connected) return text("Nobody has the project page open, so nothing can be flashed right now.", true);
          const builds = await listBuilds(projectId);
          const b = n ? builds.find((x) => x.n === n) : builds[0];
          if (!b) return text("There is no build yet. Run build first.", true);
          const base = `/api/projects/${projectId}/builds/${b.n}`;
          const sketch = parts !== "screen" && b.sketch?.ok && b.sketch.file ? `${base}/${b.sketch.file}` : undefined;
          const screen = parts !== "sketch" && b.screen?.ok && b.screen.file ? `${base}/${b.screen.file}` : undefined;
          if (!sketch && !screen) return text(`Build #${b.n} has nothing flashable for "${parts}".`, true);
          const id = randomUUID();
          const ev: ChatEvent = { kind: "flash", id, build: b.n, label: b.label, sketch, screen, screenBytes: screen ? b.screen?.bytes : undefined, status: "waiting" };
          await hub.emit(ev);
          const res = (await hub.waitFor(id, 15 * 60_000)) as Extract<ClientMessage, { type: "flash_result" }> | null;
          const status = res?.status ?? "skipped";
          const message = res ? res.message : "No answer within 15 minutes.";
          await hub.update(id, { status, message } as Partial<ChatEvent>);
          if (status === "done") {
            await markFlashed(projectId, b.n, !!sketch, !!screen);
            hub.broadcast({ type: "project_changed" });
          }
          return text(`Flash ${status}${message ? `: ${message}` : ""}`, status === "failed");
        },
      ),
      tool(
        "display",
        "Send Nextion instructions to the live display through the person's browser and the running sketch, and get the decoded replies (strings, numbers, return codes, touch events). Examples: 'get t0.txt', 'get dp', 'click b0,1', 'page 1'. Changes made this way are temporary.",
        {
          commands: z.array(z.string()).min(1).max(20),
          listen_seconds: z.number().min(0).max(30).optional().describe("Afterwards, collect events (e.g. touches) for this long"),
        },
        async ({ commands, listen_seconds }) => {
          if (!hub.connected) return text("Nobody has the project page open, so the display can't be reached.", true);
          const id = randomUUID();
          hub.broadcast({ type: "device_request", id, commands, listenSeconds: listen_seconds });
          const res = (await hub.waitFor(id, 60_000 + (listen_seconds ?? 0) * 1000)) as Extract<ClientMessage, { type: "device_result" }> | null;
          if (!res) return text("The browser didn't answer within a minute.", true);
          if (!res.ok) return text(res.error ?? "failed", true);
          return text(JSON.stringify(res.replies, null, 1));
        },
      ),
    ],
  });
}

function toolLabel(name: string, input: Record<string, unknown>, cwd: string): { label: string; detail?: string } {
  const rel = (p: unknown) => (typeof p === "string" ? path.relative(cwd, p) || p : "");
  switch (name) {
    case "Read":
      return { label: "READ", detail: rel(input.file_path) };
    case "Write":
    case "Edit":
    case "MultiEdit":
      return { label: "EDIT", detail: rel(input.file_path) };
    case "Glob":
    case "Grep":
      return { label: "SEARCH", detail: String(input.pattern ?? "") };
    case "Bash":
      return { label: "RUN", detail: String(input.command ?? "").slice(0, 120) };
    case "mcp__bench__check_screen":
      return { label: "CHECK", detail: "screen" };
    case "mcp__bench__build":
      return { label: "BUILD", detail: `${input.target} · ${input.label ?? ""}` };
    case "mcp__bench__flash":
      return { label: "FLASH", detail: `${input.parts ?? "both"}${input.build ? ` · #${input.build}` : ""}` };
    case "mcp__bench__display":
      return { label: "DISPLAY", detail: (input.commands as string[] | undefined)?.join(" · ") };
    case "TodoWrite":
      return { label: "PLAN" };
    default:
      return { label: name.replace(/^mcp__\w+__/, "").toUpperCase() };
  }
}

function resultSummary(content: unknown): string {
  const s =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : "")).join("\n")
        : "";
  return s.trim().slice(0, 4000);
}

const running = new Map<string, AbortController>();

export async function sendMessage(projectId: string, userText: string): Promise<void> {
  const hub = hubFor(projectId);
  if (hub.busy) {
    await hub.emit({ kind: "notice", id: randomUUID(), text: "Claude is still working on the last message." });
    return;
  }
  hub.setBusy(true);
  const abort = new AbortController();
  running.set(projectId, abort);
  const cwd = projectDir(projectId);
  const t0 = Date.now();
  await hub.emit({ kind: "user", id: randomUUID(), text: userText, at: new Date().toISOString() });
  try {
    const meta = await readMeta(projectId);
    const allowed = ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "TodoWrite", "mcp__bench__check_screen", "mcp__bench__build", "mcp__bench__flash", "mcp__bench__display"];
    if (config.allowBash) allowed.push("Bash");
    const q = query({
      prompt: userText,
      options: {
        cwd,
        additionalDirectories: [GUIDE_DIR],
        model: config.claudeModel,
        effort: "high",
        permissionMode: "dontAsk",
        allowedTools: allowed,
        mcpServers: { bench: benchServer(projectId, hub) },
        settingSources: [],
        resume: meta.sessionId,
        abortController: abort,
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: `${GUIDE}\n\n${config.allowBash ? "" : "You have no shell in this app: use Read, Write, Edit, Glob, Grep and the bench tools (check_screen, build, flash, display).\n"}The full component and attribute reference is ${path.join(GUIDE_DIR, "components.md")} (read the parts you need).\nThis project: "${meta.title}" · board ${meta.board.name} (${meta.board.fqbn}) · display ${meta.display.series} ${meta.display.model}, ${meta.display.width}×${meta.display.height}.`,
        },
      },
    });
    for await (const msg of q as AsyncIterable<SDKMessage>) await handle(hub, projectId, msg, cwd, t0);
  } catch (e) {
    const aborted = abort.signal.aborted;
    await hub.emit({ kind: "turn_end", id: randomUUID(), ok: false, error: aborted ? "Stopped." : String(e instanceof Error ? e.message : e), seconds: Math.round((Date.now() - t0) / 1000) });
  } finally {
    running.delete(projectId);
    hub.setBusy(false);
    hub.broadcast({ type: "project_changed" });
  }
}

async function handle(hub: ProjectHub, projectId: string, msg: SDKMessage, cwd: string, t0: number) {
  if (msg.type === "system" && msg.subtype === "init") {
    const meta = await readMeta(projectId);
    if (meta.sessionId !== msg.session_id) {
      meta.sessionId = msg.session_id;
      await writeMeta(meta);
    }
  } else if (msg.type === "assistant" && !msg.parent_tool_use_id) {
    for (const block of msg.message.content) {
      if (block.type === "text" && block.text.trim()) await hub.emit({ kind: "text", id: randomUUID(), text: block.text });
      else if (block.type === "tool_use") {
        if (block.name === "ToolSearch") continue; // internal: loading tool definitions
        const { label, detail } = toolLabel(block.name, (block.input ?? {}) as Record<string, unknown>, cwd);
        await hub.emit({ kind: "tool", id: block.id, name: block.name, label, detail });
      }
    }
  } else if (msg.type === "user" && !msg.parent_tool_use_id && Array.isArray(msg.message.content)) {
    for (const block of msg.message.content) {
      if (block.type === "tool_result") {
        if (!(await hub.load()).some((e) => e.kind === "tool" && e.id === block.tool_use_id)) continue; // hidden tool
        await hub.emit({ kind: "tool_result", id: `${block.tool_use_id}:result`, ok: !block.is_error, summary: resultSummary(block.content) });
      }
    }
  } else if (msg.type === "result") {
    await hub.emit({
      kind: "turn_end",
      id: randomUUID(),
      ok: msg.subtype === "success" && !msg.is_error,
      error: msg.subtype === "success" ? undefined : msg.subtype,
      costUsd: msg.total_cost_usd,
      seconds: Math.round((Date.now() - t0) / 1000),
    });
  }
}

export function interrupt(projectId: string) {
  running.get(projectId)?.abort();
}
