/** The bench tools (build, flash, wiring, display...), defined once and handed to whichever AI backend runs the chat. */
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
import type { ProjectHub } from "./hub.ts";
import type { ChatEvent, ClientMessage } from "./protocol.ts";
import { boardByFqbn } from "./boards.ts";
import { listBuilds, markFlashed, projectDir, readMeta, readWiring, writeWiring } from "./projects.ts";
import { applyWiring, checkWiring, wiringLines } from "./wiring.ts";

export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export interface BenchTool {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (args: any) => Promise<ToolResult>;
}

function tool<S extends z.ZodRawShape>(name: string, description: string, shape: S, run: (args: z.infer<z.ZodObject<S>>) => Promise<ToolResult>): BenchTool {
  return { name, description, shape, run };
}

export const text = (s: string, isError = false): ToolResult => ({ content: [{ type: "text" as const, text: s }], ...(isError ? { isError: true } : {}) });

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

export function benchTools(projectId: string, hub: ProjectHub): BenchTool[] {
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

  return [
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
  ];
}
