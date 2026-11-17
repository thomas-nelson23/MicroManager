/** Chat with Claude (Claude Agent SDK) inside a project folder, with build/flash/display tools. */
import { createSdkMcpServer, query, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, tool, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { lintLayout, projectFonts } from "./layout-lint.ts";
import { build } from "./builds.ts";
import { componentInfo } from "./components.ts";
import { config } from "./config.ts";
import { hubFor, type ProjectHub } from "./hub.ts";
import type { ChatEvent, ClientMessage } from "./protocol.ts";
import { boardByFqbn } from "./boards.ts";
import { listBuilds, markFlashed, projectDir, readMeta, readWiring, writeMeta, writeWiring } from "./projects.ts";
import { applyWiring, checkWiring, wiringLines } from "./wiring.ts";

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

const PREAMBLE = `You are Claude, working inside NextionDesigner, a web app where a person builds Arduino + Nextion display projects by chatting with you. Your tools: Read, Edit, Write, Glob and Grep on the project folder (your working directory), and the bench tools (ship, wire, check_screen, flash, display, component_info, install_library). Read a file before you Edit it, and give Edit the exact text. Use relative paths. Be brief.`;

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

/** One display reply as a few words: "Hello", 42, touch 0.3 press, 0x1a invalid variable name. */
function fmtReply(r: unknown): string {
  if (!r || typeof r !== "object") return JSON.stringify(r);
  const o = r as Record<string, unknown>;
  if ("sketch" in o) return `sketch: ${o.sketch}`;
  if ("error" in o) return `error: ${o.error}`;
  if ("string" in o) return JSON.stringify(o.string);
  if ("number" in o) return String(o.number);
  if ("touch" in o) {
    const t = o.touch as { page: number; component: number; event: string };
    return `touch ${t.page}.${t.component} ${t.event}`;
  }
  if ("page" in o) return `page ${o.page}`;
  if ("code" in o) return `${o.code} ${o.meaning}`;
  return JSON.stringify(o);
}

/** Display results as one line per command instead of indented JSON. */
export function compactReplies(commands: string[], replies: unknown[]): string {
  const lines: string[] = [];
  for (const r of replies) {
    const o = (r ?? {}) as { cmd?: string; reply?: unknown[]; events?: unknown[] };
    if (o.cmd !== undefined) lines.push(`${o.cmd} → ${o.reply?.length ? o.reply.map(fmtReply).join(", ") : "ok"}`);
    else if (o.events) lines.push(`events: ${o.events.length ? o.events.map(fmtReply).join(", ") : "none"}`);
    else lines.push(fmtReply(r));
  }
  return lines.join("\n") || `${commands.length} sent, no replies`;
}

function benchServer(projectId: string, hub: ProjectHub) {
  const dir = projectDir(projectId);

  const checkScreen = async (): Promise<{ ok: boolean; out: string }> => {
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
    if (out.code !== 0) return { ok: false, out: out.out.trim() };
    const hmi = await fs.promises.readFile(path.join(dir, "nextion", "hmi.txt"), "utf8").catch(() => "");
    const warn = lintLayout(hmi, meta.display.width, meta.display.height, await projectFonts(projectId));
    const msg = [out.out.trim(), ...(warn.length ? ["layout warnings (estimates):", ...warn] : [])].filter((l) => l && l !== "OK").join("\n");
    return { ok: true, out: msg || "OK" };
  };

  const flashBuild = async (n: number | undefined, parts: "both" | "sketch" | "screen"): Promise<{ ok: boolean; out: string }> => {
    if (!hub.connected) return { ok: false, out: "Not flashed: nobody has the project page open." };
    const builds = await listBuilds(projectId);
    const b = n ? builds.find((x) => x.n === n) : builds[0];
    if (!b) return { ok: false, out: "There is no build yet." };
    const base = `/api/projects/${projectId}/builds/${b.n}`;
    const sketch = parts !== "screen" && b.sketch?.ok && b.sketch.file ? `${base}/${b.sketch.file}` : undefined;
    const screen = parts !== "sketch" && b.screen?.ok && b.screen.file ? `${base}/${b.screen.file}` : undefined;
    if (!sketch && !screen) return { ok: false, out: `Build #${b.n} has nothing flashable for "${parts}".` };
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
    return { ok: status === "done", out: `Flash #${b.n} ${status}${message ? `: ${message}` : ""}` };
  };

  const displayCommands = async (commands: string[], listenSeconds?: number): Promise<{ ok: boolean; out: string }> => {
    if (!hub.connected) return { ok: false, out: "Nobody has the project page open, so the display can't be reached." };
    const id = randomUUID();
    hub.broadcast({ type: "device_request", id, commands, listenSeconds });
    const res = (await hub.waitFor(id, 60_000 + (listenSeconds ?? 0) * 1000)) as Extract<ClientMessage, { type: "device_result" }> | null;
    if (!res) return { ok: false, out: "The browser didn't answer within a minute." };
    if (!res.ok) return { ok: false, out: res.error ?? "failed" };
    return { ok: true, out: compactReplies(commands, res.replies ?? []) };
  };

  return createSdkMcpServer({
    name: "bench",
    version: "0.2.0",
    tools: [
      tool(
        "ship",
        "Check, build, flash and verify in one call. Validates nextion/hmi.txt (screen targets), compiles the target into a new numbered build (the other half is carried over), flashes it when the person has the page open (they click a button; waits up to 15 minutes), then runs the optional verify display commands. Stops at the first failure and says why.",
        {
          target: z.enum(["sketch", "screen", "both"]).describe("What changed"),
          label: z.string().describe("A few words naming the change, e.g. 'fan override'"),
          flash: z.boolean().default(true).describe("false: only build"),
          verify: z.array(z.string()).max(20).optional().describe("Display instructions to run after flashing, e.g. ['get t0.txt', 'get dp']"),
        },
        async ({ target, label, flash, verify }) => {
          const lines: string[] = [];
          if (target !== "sketch") {
            const c = await checkScreen();
            if (!c.ok) return text(`check_screen FAILED, nothing built:\n${c.out}`, true);
            if (c.out !== "OK") lines.push(`check: ${c.out}`);
          }
          const b = await build(projectId, target, label);
          hub.broadcast({ type: "project_changed" });
          lines.push(buildSummary(b));
          if ((b.sketch && !b.sketch.ok) || (b.screen && !b.screen.ok)) return text(lines.join("\n"), true);
          if (!flash) return text(lines.join("\n"));
          const f = await flashBuild(b.n, target);
          lines.push(f.out);
          if (!f.ok) return text(lines.join("\n"), hub.connected);
          if (verify?.length) {
            const d = await displayCommands(verify);
            lines.push(`verify: ${d.out}`);
            if (!d.ok) return text(lines.join("\n"), true);
          }
          return text(lines.join("\n"));
        },
      ),
      tool(
        "wire",
        "Change the project's wiring (wiring.json) without reading or editing the file, and get the resulting wiring and any problems the app found (pin missing on this board, two parts on a pin, no PWM, 5 V into a 3.3 V pin). `remove` runs first. Call with no arguments to see the wiring.",
        {
          set: z
            .array(z.object({ pin: z.string(), part: z.string(), partPin: z.string().optional(), color: z.string().optional(), signal: z.string().optional().describe("'5V' when the part drives 5 V into the pin") }))
            .max(40)
            .optional()
            .describe("Wires to add; replaces that part's wire with the same partPin"),
          remove: z.array(z.string()).max(40).optional().describe("Part names (all their wires) or board pins to clear"),
        },
        async ({ set, remove }) => {
          const cur = await readWiring(projectId);
          if (cur.error) return text(`${cur.error}. Fix or rewrite wiring.json.`, true);
          const next = set?.length || remove?.length ? applyWiring(cur.wiring, { set, remove }) : cur.wiring;
          if (next !== cur.wiring) {
            await writeWiring(projectId, next);
            hub.broadcast({ type: "project_changed" });
          }
          const board = boardByFqbn((await readMeta(projectId)).board.fqbn);
          const issues = board ? checkWiring(board, next).filter((i) => i.level !== "info") : [];
          return text(`${wiringLines(next)}${issues.length ? `\nproblems:\n${issues.map((i) => `- ${i.text}`).join("\n")}` : ""}`);
        },
      ),
      tool(
        "check_screen",
        "Validate nextion/hmi.txt without building (ship does this too): shape, component types, attributes, text lengths, events, and that every obj.attr in event code exists.",
        {},
        async () => {
          const c = await checkScreen();
          return text(c.out, !c.ok);
        },
      ),
      tool(
        "component_info",
        "A Nextion component's full attribute list (type, default, range, whether settable at runtime). Give an hmi.txt type name, objtype number or name prefix, e.g. 'slider', '122', 'bt'.",
        { type: z.string().min(1).max(40) },
        async ({ type }) => text(componentInfo(type)),
      ),
      tool(
        "flash",
        "Re-flash an existing build (ship already flashes new builds). The sketch goes to the board; the screen is uploaded through NexPass.",
        {
          build: z.number().int().optional().describe("Build number; defaults to the latest"),
          parts: z.enum(["both", "sketch", "screen"]).default("both"),
        },
        async ({ build: n, parts }) => {
          const f = await flashBuild(n, parts);
          return text(f.out, !f.ok);
        },
      ),
      tool(
        "install_library",
        "Install an Arduino library with arduino-cli (from the Arduino library index), e.g. 'DHT sensor library' or 'Adafruit NeoPixel'. Use the exact library name from the index; dependencies are installed too.",
        { name: z.string().min(1).max(100), version: z.string().max(20).optional() },
        async ({ name, version }) => {
          const spec = version ? `${name}@${version}` : name;
          const out = await new Promise<{ code: number; out: string }>((resolve) => {
            const p = spawn(config.arduinoCli, ["lib", "install", spec]);
            let o = "";
            p.stdout.on("data", (d) => (o += d));
            p.stderr.on("data", (d) => (o += d));
            p.on("error", (e) => resolve({ code: 1, out: String(e) }));
            p.on("close", (code) => resolve({ code: code ?? 1, out: o }));
          });
          return text(out.out.trim().slice(-2000) || "installed", out.code !== 0);
        },
      ),
      tool(
        "display",
        "Send Nextion instructions to the live display through the person's browser and the running sketch, and get the decoded replies. Examples: 'get t0.txt', 'get dp', 'click b0,1', 'page 1'. Changes are temporary. A line starting with '@' goes to the sketch's NexPass.onRequest handler instead (see device.md) and returns its reply lines.",
        {
          commands: z.array(z.string()).min(1).max(20),
          listen_seconds: z.number().min(0).max(30).optional().describe("Afterwards, collect events (e.g. touches) for this long"),
        },
        async ({ commands, listen_seconds }) => {
          const d = await displayCommands(commands, listen_seconds);
          return text(d.out, !d.ok);
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

/** Forget the conversation so far: the next message starts a new Claude session. Files are untouched. */
export async function newConversation(projectId: string): Promise<void> {
  const meta = await readMeta(projectId);
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
export function freshReason(meta: { sessionId?: string; sessionAt?: string; sessionContext?: number }, now = Date.now()): string | undefined {
  if (!meta.sessionId) return undefined;
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
  if (hub.busy) {
    await hub.emit({ kind: "notice", id: randomUUID(), text: "Claude is still working on the last message." });
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
  const model = opts.strong ? config.strongModel : config.chatModel;
  const turn: Turn = { steps: new Set(), context: 0, model };
  try {
    const meta = await readMeta(projectId);
    // Every step re-sends the whole conversation, so long or stale sessions are the main cost: start over and hand Claude a short recap.
    const why = freshReason(meta);
    if (why) {
      delete meta.sessionId;
      await writeMeta(meta);
      userText = `${await recap(projectId, earlier)}\n\n${userText}`;
      await hub.emit({ kind: "notice", id: randomUUID(), text: `Claude started a fresh conversation ${why}, with a short recap. Your files are unchanged.` });
    }
    const tools = ["Read", "Edit", "Write", "Glob", "Grep"];
    if (config.allowBash) tools.push("Bash");
    const allowed = [...tools, "mcp__bench__ship", "mcp__bench__wire", "mcp__bench__check_screen", "mcp__bench__component_info", "mcp__bench__flash", "mcp__bench__display", "mcp__bench__install_library"];
    const boardNotes = BOARD_NOTES.get(meta.board.fqbn) ?? "";
    if (hub.screenEdits.size) {
      userText = `(Saved by the person in the screen editor since your last turn, already in nextion/hmi.txt: ${[...hub.screenEdits].join("; ")}. Keep those values unless asked.)\n\n${userText}`;
      hub.screenEdits.clear();
    }
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
        mcpServers: { bench: benchServer(projectId, hub) },
        settingSources: [],
        resume: meta.sessionId,
        maxTurns: 40,
        abortController: abort,
        env: { ...process.env, ENABLE_TOOL_SEARCH: "false" },
        // A lean prompt of our own instead of the Claude Code preset (~8k tokens). The part before the boundary is
        // the same for every project, so it stays in the prompt cache.
        systemPrompt: [
          `${PREAMBLE}\n\n${GUIDE}`,
          SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
          `This project: "${meta.title}" · folder ${cwd} · board ${meta.board.name} (${meta.board.fqbn}) · display ${meta.display.series} ${meta.display.model}, ${meta.display.width}×${meta.display.height}.${config.allowBash ? "" : " There is no shell."}\n\n${boardNotes}`,
        ],
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
    const tokens = {
      input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      cached: u.cache_read_input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      context: turn.context,
      steps: msg.num_turns ?? turn.steps.size,
      model: turn.model,
    };
    const seconds = Math.round((Date.now() - t0) / 1000);
    await hub.emit({
      kind: "turn_end",
      id: randomUUID(),
      ok: msg.subtype === "success" && !msg.is_error,
      error: msg.subtype === "success" ? undefined : msg.subtype,
      costUsd: msg.total_cost_usd,
      seconds,
      tokens,
    });
    await rememberSession(projectId, turn);
    // one line per turn, to see where usage goes over time (kept out of project copies like the chat log)
    await fs.promises
      .appendFile(path.join(projectDir(projectId), ".chat-usage.jsonl"), JSON.stringify({ at: new Date().toISOString(), seconds, costUsd: msg.total_cost_usd, ...tokens }) + "\n")
      .catch(() => {});
  }
}

export function interrupt(projectId: string) {
  running.get(projectId)?.abort();
}
