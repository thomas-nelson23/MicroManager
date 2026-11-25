/** Chat inside a project folder, with build/flash/display tools: Claude (Claude Agent SDK) by default, or a Hermes model (OpenAI-compatible API, see hermes.ts). */
import { createSdkMcpServer, query, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, tool, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { benchTools } from "./bench.ts";
import { config } from "./config.ts";
import { runHermesTurn, HERMES_SESSION_FILE } from "./hermes.ts";
import { hubFor, type ProjectHub } from "./hub.ts";
import type { ChatEvent } from "./protocol.ts";
import { listBuilds, projectDir, readMeta, writeMeta } from "./projects.ts";

export { compactReplies } from "./bench.ts";

const GUIDE_DIR = path.join(config.serverRoot, "guide");
const GUIDE_FULL = fs.readFileSync(path.join(GUIDE_DIR, "GUIDE.md"), "utf8");

/** The guide without its per-board notes (identical for every project, so the prompt cache is shared), and those notes by FQBN. */
export function splitGuide(md: string): { guide: string; boards: Map<string, string> } {
  const boards = new Map<string, string>();
  const parts = md.split(/^### board: /m);
  for (const p of parts.slice(1)) {
    const nl = p.indexOf("\n");
    boards.set(p.slice(0, nl).trim(), p.slice(nl + 1).trim());
  }
  return { guide: parts[0]!.replace(/<!--[^>]*-->\s*$/, "").trim(), boards };
}
const { guide: GUIDE, boards: BOARD_NOTES } = splitGuide(GUIDE_FULL);

/** Same text for both backends; only the name differs. */
export const preamble = (name: string) => `You are ${name}, working inside MicroManager, a web app where a person builds Arduino + Nextion display projects by chatting with you. Your tools: Read, Edit, Write, Glob and Grep on the project folder (your working directory), and the bench tools (ship, wire, check_screen, flash, display, component_info, install_library). Read a file before you Edit it, and give Edit the exact text. Use relative paths. Be brief.`;

/** The project's context line and board notes: the part of the prompt that differs per project. */
export function projectContext(meta: Awaited<ReturnType<typeof readMeta>>, cwd: string): string {
  return `This project: "${meta.title}" · folder ${cwd} · board ${meta.board.name} (${meta.board.fqbn}) · display ${meta.display.series} ${meta.display.model}, ${meta.display.width}×${meta.display.height}.${config.allowBash ? "" : " There is no shell."}\n\n${BOARD_NOTES.get(meta.board.fqbn) ?? ""}`;
}


export function toolLabel(name: string, input: Record<string, unknown>, cwd: string): { label: string; detail?: string } {
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
    case "mcp__bench__ship":
      return { label: input.flash === false ? "BUILD" : "SHIP", detail: `${input.target} · ${input.label ?? ""}` };
    case "mcp__bench__wire":
      return { label: "WIRING", detail: [...((input.set as { pin: string; part: string }[] | undefined) ?? []).map((c) => `${c.part} on ${c.pin}`), ...((input.remove as string[] | undefined) ?? []).map((r) => `remove ${r}`)].join(" · ") || "look" };
    case "mcp__bench__component_info":
      return { label: "LOOKUP", detail: String(input.type ?? "") };
    case "mcp__bench__flash":
      return { label: "FLASH", detail: `${input.parts ?? "both"}${input.build ? ` · #${input.build}` : ""}` };
    case "mcp__bench__install_library":
      return { label: "LIBRARY", detail: String(input.name ?? "") };
    case "mcp__bench__display":
      return { label: "DISPLAY", detail: (input.commands as string[] | undefined)?.join(" · ") };
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

/** Forget the conversation so far: the next message starts a new session. Files are untouched. */
export async function newConversation(projectId: string): Promise<void> {
  const meta = await readMeta(projectId);
  await fs.promises.rm(path.join(projectDir(projectId), HERMES_SESSION_FILE), { force: true });
  delete meta.sessionId;
  delete meta.sessionContext;
  await writeMeta(meta);
  await hubFor(projectId).reset();
}

const IMAGE_EXT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };

/** Save attached pictures under uploads/ and return their project-relative paths. */
async function saveImages(projectId: string, images: { name: string; dataUrl: string }[] | undefined): Promise<string[]> {
  const out: string[] = [];
  for (const img of (images ?? []).slice(0, 4)) {
    const m = /^data:(image\/[a-z]+);base64,(.+)$/s.exec(img.dataUrl);
    const ext = m && IMAGE_EXT[m[1]!];
    if (!m || !ext) continue;
    const data = Buffer.from(m[2]!, "base64");
    if (data.length > 8 * 1024 * 1024) continue;
    const dir = path.join(projectDir(projectId), "uploads");
    await fs.promises.mkdir(dir, { recursive: true });
    const file = `${Date.now()}-${out.length}${ext}`;
    await fs.promises.writeFile(path.join(dir, file), data);
    out.push(`uploads/${file}`);
  }
  return out;
}

/** Why the next message should start a new Claude session instead of resuming the last one, if it should. */
export function freshReason(meta: { sessionId?: string; sessionAt?: string; sessionContext?: number }, now = Date.now(), provider = config.provider): string | undefined {
  if (!meta.sessionId) return undefined;
  // a session from the other backend can't be resumed: Hermes session ids start with "hermes-"
  if (meta.sessionId.startsWith("hermes-") !== (provider === "hermes")) return "because the AI model changed";
  // sessions from before the lean setup recorded the old, much bigger prompt and tool set
  if (!meta.sessionAt) return "with the leaner setup";
  if (meta.sessionAt && now - Date.parse(meta.sessionAt) > config.freshAfterMinutes * 60_000) return "after a break";
  if ((meta.sessionContext ?? 0) > config.maxContextTokens) return "because the last one got long";
  return undefined;
}

/** A short recap of the chat so far, for the first message of a fresh session (the files hold the rest). */
export async function recap(projectId: string, events: ChatEvent[]): Promise<string> {
  const said: string[] = [];
  let budget = 1500;
  for (let i = events.length - 1; i >= 0 && budget > 0 && said.length < 8; i--) {
    const e = events[i]!;
    if (e.kind !== "user" && e.kind !== "text") continue;
    const t = e.text.replace(/\s+/g, " ").trim();
    const line = `${e.kind === "user" ? "Person" : "You"}: ${t.length > 300 ? t.slice(0, 300) + "…" : t}`;
    budget -= line.length;
    said.unshift(line);
  }
  const b = (await listBuilds(projectId))[0];
  const build = b
    ? `Latest build #${b.n} "${b.label}": sketch ${b.sketch ? (b.sketch.ok ? "ok" : "failed") : "-"}, screen ${b.screen ? (b.screen.ok ? "ok" : "failed") : "-"}${b.flashed ? ", flashed" : ", not flashed"}.`
    : "No builds yet.";
  return `(New conversation. Recent chat, for context:\n${said.join("\n")}\n${build} Read the project files as needed; they are the source of truth.)`;
}

interface Turn {
  steps: Set<string>;
  context: number;
  model: string;
}

export async function sendMessage(projectId: string, typedText: string, attached?: { name: string; dataUrl: string }[], opts: { strong?: boolean } = {}): Promise<void> {
  const hub = hubFor(projectId);
  const name = config.assistantName;
  if (hub.busy) {
    await hub.emit({ kind: "notice", id: randomUUID(), text: `${name} is still working on the last message.` });
    return;
  }
  hub.setBusy(true);
  const abort = new AbortController();
  running.set(projectId, abort);
  const cwd = projectDir(projectId);
  const t0 = Date.now();
  const images = await saveImages(projectId, attached).catch(() => []);
  let userText = images.length ? `${typedText}\n\n[Attached picture${images.length > 1 ? "s" : ""}: ${images.join(", ")}. Read ${images.length > 1 ? "them" : "it"} to see ${images.length > 1 ? "them" : "it"}.]`.trim() : typedText;
  const earlier = [...(await hub.load())];
  await hub.emit({ kind: "user", id: randomUUID(), text: typedText, at: new Date().toISOString(), ...(images.length ? { images } : {}) });
  const hermes = config.provider === "hermes";
  const model = hermes ? (opts.strong ? config.hermes.strongModel : config.hermes.model) : opts.strong ? config.strongModel : config.chatModel;
  const turn: Turn = { steps: new Set(), context: 0, model };
  try {
    const meta = await readMeta(projectId);
    // Every step re-sends the whole conversation, so long or stale sessions are the main cost: start over and hand the model a short recap.
    const why = freshReason(meta);
    if (why) {
      delete meta.sessionId;
      await writeMeta(meta);
      userText = `${await recap(projectId, earlier)}\n\n${userText}`;
      await hub.emit({ kind: "notice", id: randomUUID(), text: `${name} started a fresh conversation ${why}, with a short recap. Your files are unchanged.` });
    }
    if (hub.screenEdits.size) {
      userText = `(Saved by the person in the screen editor since your last turn, already in nextion/hmi.txt: ${[...hub.screenEdits].join("; ")}. Keep those values unless asked.)\n\n${userText}`;
      hub.screenEdits.clear();
    }
    if (hermes) {
      const r = await runHermesTurn({
        projectId,
        hub,
        cwd,
        model,
        userText,
        sessionId: meta.sessionId,
        systemPrompt: `${preamble(name)}\n\n${GUIDE}\n\n${projectContext(meta, cwd)}`,
        signal: abort.signal,
        label: (tool, input) => toolLabel(tool, input, cwd),
      });
      if (r.sessionId !== meta.sessionId) {
        const m = await readMeta(projectId);
        m.sessionId = r.sessionId;
        await writeMeta(m);
      }
      turn.context = r.context;
      await finishTurn(hub, projectId, t0, turn, { ok: r.ok, error: r.error, costUsd: r.costUsd, steps: r.steps, input: r.input, cached: r.cached, output: r.output });
      return;
    }
    const tools = ["Read", "Edit", "Write", "Glob", "Grep"];
    if (config.allowBash) tools.push("Bash");
    const bench = benchTools(projectId, hub);
    const allowed = [...tools, ...bench.map((t) => `mcp__bench__${t.name}`)];
    const q = query({
      prompt: userText,
      options: {
        cwd,
        model,
        effort: config.claudeEffort,
        permissionMode: "dontAsk",
        // Only the tools this app uses: the full Claude Code set adds ~25k tokens of definitions to every step.
        tools,
        allowedTools: allowed,
        mcpServers: { bench: createSdkMcpServer({ name: "bench", version: "0.2.0", tools: bench.map((t) => tool(t.name, t.description, t.shape, t.run)) }) },
        settingSources: [],
        resume: meta.sessionId,
        maxTurns: 40,
        abortController: abort,
        env: { ...process.env, ENABLE_TOOL_SEARCH: "false" },
        // A lean prompt of our own instead of the Claude Code preset (~8k tokens). The part before the boundary is
        // the same for every project, so it stays in the prompt cache.
        systemPrompt: [`${preamble("Claude")}\n\n${GUIDE}`, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, projectContext(meta, cwd)],
      },
    });
    for await (const msg of q as AsyncIterable<SDKMessage>) await handle(hub, projectId, msg, cwd, t0, turn);
  } catch (e) {
    const aborted = abort.signal.aborted;
    await hub.emit({ kind: "turn_end", id: randomUUID(), ok: false, error: aborted ? "Stopped." : String(e instanceof Error ? e.message : e), seconds: Math.round((Date.now() - t0) / 1000) });
    await rememberSession(projectId, turn);
  } finally {
    running.delete(projectId);
    hub.setBusy(false);
    hub.broadcast({ type: "project_changed" });
  }
}

/** Record when the session last ran and how big it is, for the fresh-session rule. */
async function rememberSession(projectId: string, turn: Turn) {
  const meta = await readMeta(projectId);
  meta.sessionAt = new Date().toISOString();
  if (turn.context) meta.sessionContext = turn.context;
  await writeMeta(meta);
}

/** End a turn: the token meter in the chat, the fresh-session bookkeeping, and one line in .chat-usage.jsonl. */
async function finishTurn(
  hub: ProjectHub,
  projectId: string,
  t0: number,
  turn: Turn,
  r: { ok: boolean; error?: string; costUsd?: number; steps: number; input: number; cached: number; output: number },
) {
  const tokens = { input: r.input, cached: r.cached, output: r.output, context: turn.context, steps: r.steps, model: turn.model };
  const seconds = Math.round((Date.now() - t0) / 1000);
  await hub.emit({ kind: "turn_end", id: randomUUID(), ok: r.ok, error: r.error, costUsd: r.costUsd, seconds, tokens });
  await rememberSession(projectId, turn);
  // one line per turn, to see where usage goes over time (kept out of project copies like the chat log)
  await fs.promises
    .appendFile(path.join(projectDir(projectId), ".chat-usage.jsonl"), JSON.stringify({ at: new Date().toISOString(), seconds, costUsd: r.costUsd, ...tokens }) + "\n")
    .catch(() => {});
}

type Usage = { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number };

async function handle(hub: ProjectHub, projectId: string, msg: SDKMessage, cwd: string, t0: number, turn: Turn) {
  if (msg.type === "system" && msg.subtype === "init") {
    const meta = await readMeta(projectId);
    if (meta.sessionId !== msg.session_id) {
      meta.sessionId = msg.session_id;
      await writeMeta(meta);
    }
  } else if (msg.type === "assistant" && !msg.parent_tool_use_id) {
    const u = msg.message.usage as Usage | undefined;
    if (u) turn.context = Math.max(turn.context, (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0));
    if (msg.message.id) turn.steps.add(msg.message.id);
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
    const u = (msg.usage ?? {}) as Usage;
    await finishTurn(hub, projectId, t0, turn, {
      ok: msg.subtype === "success" && !msg.is_error,
      error: msg.subtype === "success" ? undefined : msg.subtype,
      costUsd: msg.total_cost_usd,
      steps: msg.num_turns ?? turn.steps.size,
      input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      cached: u.cache_read_input_tokens ?? 0,
      output: u.output_tokens ?? 0,
    });
  }
}

export function interrupt(projectId: string) {
  running.get(projectId)?.abort();
}
