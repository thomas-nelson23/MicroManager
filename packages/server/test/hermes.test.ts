import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { freshReason } from "../src/chat.ts";
import { fileTools, globToRegExp, resolveIn } from "../src/file-tools.ts";
import { answerAll, HERMES_SESSION_FILE, parseTextToolCalls, runHermesTurn, stripThinking, toolSpecs, type Msg } from "../src/hermes.ts";
import type { ProjectHub } from "../src/hub.ts";
import type { ChatEvent } from "../src/protocol.ts";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-test-"));
  fs.mkdirSync(path.join(dir, "sketch"));
  fs.writeFileSync(path.join(dir, "sketch", "sketch.ino"), "void setup() {\n  pinMode(13, OUTPUT);\n}\nvoid loop() {}\n");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const tool = (name: string) => fileTools(dir).find((t) => t.name === name)!;
const out = (r: { content: { text: string }[] }) => r.content.map((c) => c.text).join("\n");

describe("file tools", () => {
  it("refuse paths outside the project, symlinks included", () => {
    expect(() => resolveIn(dir, "../etc/passwd")).toThrow(/outside/);
    expect(() => resolveIn(dir, "/etc/passwd")).toThrow(/outside/);
    fs.symlinkSync("/etc", path.join(dir, "escape"));
    expect(() => resolveIn(dir, "escape/passwd")).toThrow(/outside/);
    expect(resolveIn(dir, "sketch/new.h")).toBe(path.join(dir, "sketch", "new.h"));
  });
  it("read with line numbers, and edit exact, unique text", async () => {
    expect(out(await tool("Read").run({ file_path: "sketch/sketch.ino", offset: 2, limit: 1 }))).toBe("     2\t  pinMode(13, OUTPUT);\n(3 more lines; use offset)");
    const miss = await tool("Edit").run({ file_path: "sketch/sketch.ino", old_string: "pinMode(12", new_string: "x" });
    expect(miss.isError).toBe(true);
    const dup = await tool("Edit").run({ file_path: "sketch/sketch.ino", old_string: "void", new_string: "int" });
    expect(out(dup)).toMatch(/occurs 2 times/);
    await tool("Edit").run({ file_path: "sketch/sketch.ino", old_string: "13", new_string: "LED_BUILTIN" });
    expect(fs.readFileSync(path.join(dir, "sketch", "sketch.ino"), "utf8")).toContain("pinMode(LED_BUILTIN, OUTPUT)");
  });
  it("write, glob and grep", async () => {
    await tool("Write").run({ file_path: "nextion/hmi.txt", content: "page0\n  t0 text\n" });
    expect(out(await tool("Glob").run({ pattern: "**/*.{ino,txt}" })).split("\n").sort()).toEqual(["nextion/hmi.txt", "sketch/sketch.ino"]);
    expect(out(await tool("Glob").run({ pattern: "*.ino" }))).toBe("sketch/sketch.ino");
    expect(out(await tool("Grep").run({ pattern: "pinMode" }))).toBe("sketch/sketch.ino:2:   pinMode(13, OUTPUT);");
    expect(out(await tool("Grep").run({ pattern: "T0", "-i": true, output_mode: "files_with_matches" }))).toBe("nextion/hmi.txt");
  });
  it("glob patterns", () => {
    expect(globToRegExp("**/*.ino").test("a/b/c.ino")).toBe(true);
    expect(globToRegExp("**/*.ino").test("c.ino")).toBe(true);
    expect(globToRegExp("*.ino").test("a/c.ino")).toBe(false);
    expect(globToRegExp("nextion/*.{txt,zi}").test("nextion/font.zi")).toBe(true);
  });
});

describe("hermes replies", () => {
  it("drop thinking and read text tool calls", () => {
    expect(stripThinking("<think>hmm</think>\nDone.")).toBe("Done.");
    const p = parseTextToolCalls('Let me look.\n<tool_call>\n{"name": "Read", "arguments": {"file_path": "a.ino"}}\n</tool_call>');
    expect(p.rest).toBe("Let me look.");
    expect(p.calls).toHaveLength(1);
    expect(JSON.parse(p.calls[0]!.function.arguments)).toEqual({ file_path: "a.ino" });
  });
  it("tool specs are plain JSON schema with optional defaults", () => {
    const [read] = toolSpecs(fileTools(dir));
    expect(read!.function.parameters).toMatchObject({ type: "object", required: ["file_path"] });
    expect(JSON.stringify(read)).not.toContain("$schema");
  });
  it("answer tool calls a stopped turn left open", () => {
    const m: Msg[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: null, tool_calls: [{ id: "a", type: "function", function: { name: "Read", arguments: "{}" } }, { id: "b", type: "function", function: { name: "Read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "a", content: "ok" },
    ];
    answerAll(m);
    expect(m.map((x) => (x.role === "tool" ? x.tool_call_id : x.role))).toEqual(["user", "assistant", "a", "b"]);
  });
});

describe("hermes turn", () => {
  it("runs tools, keeps the conversation and resumes it", async () => {
    const events: ChatEvent[] = [];
    const hub = { emit: async (e: ChatEvent) => void events.push(e), broadcast: () => {}, connected: false } as unknown as ProjectHub;
    const bodies: { messages: Msg[] }[] = [];
    const replies = [
      { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "Edit", arguments: JSON.stringify({ file_path: "sketch/sketch.ino", old_string: "13", new_string: "7" }) } }] } }], usage: { prompt_tokens: 1000, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 600 } } },
      { choices: [{ message: { content: "<think>ok</think>Moved the LED to pin 7." } }], usage: { prompt_tokens: 1100, completion_tokens: 10, cost: 0.001 } },
      { choices: [{ message: { content: "Still pin 7." } }], usage: { prompt_tokens: 1200, completion_tokens: 5 } },
    ];
    const complete = async (body: unknown) => {
      bodies.push(JSON.parse(JSON.stringify(body)) as { messages: Msg[] });
      return replies.shift()!;
    };
    const base = { projectId: "p", hub, cwd: dir, model: "m", systemPrompt: "sys", signal: new AbortController().signal, label: (n: string) => ({ label: n.toUpperCase() }), complete };
    const r = await runHermesTurn({ ...base, userText: "use pin 7" });
    expect(r).toMatchObject({ ok: true, steps: 2, input: 400 + 1100, cached: 600, output: 30, context: 1110, costUsd: 0.001 });
    expect(r.sessionId).toMatch(/^hermes-/);
    expect(fs.readFileSync(path.join(dir, "sketch", "sketch.ino"), "utf8")).toContain("pinMode(7, OUTPUT)");
    expect(events.map((e) => e.kind)).toEqual(["tool", "tool_result", "text"]);
    expect(events[2]).toMatchObject({ text: "Moved the LED to pin 7." });
    expect(bodies[1]!.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1", content: "Edited sketch/sketch.ino." });
    expect(fs.existsSync(path.join(dir, HERMES_SESSION_FILE))).toBe(true);

    const again = await runHermesTurn({ ...base, userText: "which pin?", sessionId: r.sessionId });
    expect(again.sessionId).toBe(r.sessionId);
    expect(bodies[2]!.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "assistant", "user"]);
  });
  it("reports a refused request as the turn's error", async () => {
    const hub = { emit: async () => {} } as unknown as ProjectHub;
    const r = await runHermesTurn({
      projectId: "p",
      hub,
      cwd: dir,
      model: "m",
      systemPrompt: "s",
      userText: "hi",
      signal: new AbortController().signal,
      label: (n) => ({ label: n }),
      complete: async () => {
        throw new Error("The model server refused the request (401): bad key. Check HERMES_API_KEY.");
      },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/HERMES_API_KEY/);
  });
});

describe("switching backends", () => {
  it("starts fresh when the session belongs to the other backend", () => {
    const at = new Date().toISOString();
    expect(freshReason({ sessionId: "abc", sessionAt: at }, Date.now(), "hermes")).toBe("because the AI model changed");
    expect(freshReason({ sessionId: "hermes-1", sessionAt: at }, Date.now(), "claude")).toBe("because the AI model changed");
    expect(freshReason({ sessionId: "hermes-1", sessionAt: at }, Date.now(), "hermes")).toBeUndefined();
    expect(freshReason({ sessionId: "abc", sessionAt: at }, Date.now(), "claude")).toBeUndefined();
  });
});
