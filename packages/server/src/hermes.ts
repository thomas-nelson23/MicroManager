/**
 * The chat on a Hermes model (Nous Research), or any other model, through an OpenAI-compatible chat completions API:
 * OpenRouter, Nous Portal, Ollama, LM Studio, vLLM, llama.cpp... It runs the same tools as the Claude backend
 * (file tools from file-tools.ts, bench tools from bench.ts) in a small loop of our own, and keeps the
 * conversation in <project>/.chat-hermes.json so the next message carries on where this one stopped.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { benchTools, type BenchTool, type ToolResult } from "./bench.ts";
import { config } from "./config.ts";
import { fileTools } from "./file-tools.ts";
import type { ProjectHub } from "./hub.ts";

/** Starts with ".chat" so project copies and the file list leave it out, like the chat log. */
export const HERMES_SESSION_FILE = ".chat-hermes.json";
const MAX_STEPS = 40;

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type Completion = {
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[]; reasoning?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; cost?: number };
  error?: { message?: string };
};

export interface HermesTurn {
  projectId: string;
  hub: ProjectHub;
  cwd: string;
  model: string;
  userText: string;
  sessionId?: string;
  systemPrompt: string;
  signal: AbortSignal;
  label: (tool: string, input: Record<string, unknown>) => { label: string; detail?: string };
  /** For tests: what sends a request. Defaults to fetch against config.hermes.baseUrl. */
  complete?: (body: unknown, signal: AbortSignal) => Promise<Completion>;
}

export interface HermesResult {
  ok: boolean;
  error?: string;
  sessionId: string;
  steps: number;
  input: number;
  cached: number;
  output: number;
  context: number;
  costUsd?: number;
}

/** OpenAI's tool format, from the zod shapes the tools are defined with. */
export function toolSpecs(tools: BenchTool[]) {
  return tools.map((t) => {
    const schema = z.toJSONSchema(z.object(t.shape), { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    delete schema.$schema;
    return { type: "function" as const, function: { name: t.name, description: t.description, parameters: schema } };
  });
}

/** Remove a reasoning block (<think>…</think>) that Hermes models can put at the start of a reply. */
export const stripThinking = (s: string) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();

/**
 * Tool calls a model wrote as text in Hermes' own format (<tool_call>{"name": …, "arguments": {…}}</tool_call>),
 * for servers that don't turn them into tool_calls. Returns the calls and the text around them.
 */
export function parseTextToolCalls(content: string): { calls: ToolCall[]; rest: string } {
  const calls: ToolCall[] = [];
  const rest = content.replace(/<tool_call>\s*([\s\S]*?)\s*(<\/tool_call>|$)/g, (whole, body: string) => {
    try {
      const o = JSON.parse(body) as { name?: string; arguments?: unknown; parameters?: unknown };
      if (!o.name) return whole;
      const args = o.arguments ?? o.parameters ?? {};
      calls.push({ id: `call_${randomUUID().slice(0, 8)}`, type: "function", function: { name: o.name, arguments: typeof args === "string" ? args : JSON.stringify(args) } });
      return "";
    } catch {
      return whole;
    }
  });
  return { calls, rest: rest.trim() };
}

async function httpComplete(body: unknown, signal: AbortSignal): Promise<Completion> {
  const { baseUrl, apiKey, timeout } = config.hermes;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      // OpenRouter shows these on its activity page; harmless elsewhere
      "x-title": "Nextion Arduino",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeout * 1000)]),
  });
  const raw = await res.text();
  let data: Completion;
  try {
    data = JSON.parse(raw) as Completion;
  } catch {
    throw new Error(`The model server answered ${res.status} with something that isn't JSON: ${raw.slice(0, 200)}`);
  }
  if (!res.ok || data.error) {
    const why = data.error?.message ?? raw.slice(0, 300);
    const hint = res.status === 401 || res.status === 403 ? " Check HERMES_API_KEY." : res.status === 404 ? " Check HERMES_BASE_URL and HERMES_MODEL." : "";
    throw new Error(`The model server refused the request (${res.status}): ${why}.${hint}`);
  }
  return data;
}

async function loadSession(cwd: string, id: string | undefined): Promise<Msg[]> {
  if (!id) return [];
  try {
    const s = JSON.parse(await fs.promises.readFile(path.join(cwd, HERMES_SESSION_FILE), "utf8")) as { id?: string; messages?: Msg[] };
    return s.id === id && Array.isArray(s.messages) ? s.messages : [];
  } catch {
    return [];
  }
}

/** Give every tool call an answer, so a turn stopped halfway still leaves a conversation the API accepts. */
export function answerAll(messages: Msg[]): void {
  const answered = new Set(messages.flatMap((m) => (m.role === "tool" ? [m.tool_call_id] : [])));
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant" || !m.tool_calls) continue;
    const missing = m.tool_calls.filter((c) => !answered.has(c.id));
    if (!missing.length) break;
    const at = i + 1 + m.tool_calls.length - missing.length;
    messages.splice(at, 0, ...missing.map((c) => ({ role: "tool" as const, tool_call_id: c.id, content: "Not run: the person stopped the turn." })));
    break;
  }
}

const resultText = (r: ToolResult) => r.content.map((c) => c.text).join("\n");

export async function runHermesTurn(t: HermesTurn): Promise<HermesResult> {
  const complete = t.complete ?? httpComplete;
  const past = await loadSession(t.cwd, t.sessionId);
  const sessionId = past.length && t.sessionId ? t.sessionId : `hermes-${randomUUID()}`;
  const messages: Msg[] = [...past, { role: "user", content: t.userText }];
  const benchList = benchTools(t.projectId, t.hub);
  const tools = [...fileTools(t.cwd, { bash: config.allowBash, signal: t.signal }), ...benchList];
  const bench = new Set(benchList.map((x) => x.name));
  const byName = new Map(tools.map((x) => [x.name, x]));
  const specs = toolSpecs(tools);
  const r: HermesResult = { ok: false, sessionId, steps: 0, input: 0, cached: 0, output: 0, context: 0 };
  const save = () => fs.promises.writeFile(path.join(t.cwd, HERMES_SESSION_FILE), JSON.stringify({ id: sessionId, model: t.model, messages })).catch(() => {});

  try {
    while (r.steps < MAX_STEPS) {
      if (t.signal.aborted) throw new Error("Stopped.");
      r.steps++;
      const data = await complete({ model: t.model, messages: [{ role: "system", content: t.systemPrompt }, ...messages], tools: specs, tool_choice: "auto" }, t.signal);
      const u = data.usage ?? {};
      const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
      r.input += Math.max(0, (u.prompt_tokens ?? 0) - cached);
      r.cached += cached;
      r.output += u.completion_tokens ?? 0;
      r.context = Math.max(r.context, (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0));
      if (typeof u.cost === "number") r.costUsd = (r.costUsd ?? 0) + u.cost;

      const m = data.choices?.[0]?.message;
      if (!m) throw new Error("The model server sent no reply.");
      let content = stripThinking(m.content ?? "");
      let calls = m.tool_calls ?? [];
      if (!calls.length && content.includes("<tool_call>")) ({ calls, rest: content } = parseTextToolCalls(content));
      calls = calls.map((c) => ({ ...c, id: c.id || `call_${randomUUID().slice(0, 8)}`, type: "function" as const }));

      messages.push({ role: "assistant", content: content || null, ...(calls.length ? { tool_calls: calls } : {}) });
      if (content) await t.hub.emit({ kind: "text", id: randomUUID(), text: content });
      if (!calls.length) {
        r.ok = true;
        break;
      }
      for (const c of calls) {
        let args: Record<string, unknown> = {};
        let res: ToolResult;
        const tool = byName.get(c.function.name);
        try {
          args = c.function.arguments ? (JSON.parse(c.function.arguments) as Record<string, unknown>) : {};
        } catch {
          args = {};
        }
        const { label, detail } = t.label(bench.has(c.function.name) ? `mcp__bench__${c.function.name}` : c.function.name, args);
        await t.hub.emit({ kind: "tool", id: c.id, name: c.function.name, label, detail });
        if (!tool) res = { content: [{ type: "text", text: `There is no tool called ${c.function.name}. Tools: ${[...byName.keys()].join(", ")}.` }], isError: true };
        else {
          const parsed = z.object(tool.shape).safeParse(args);
          res = parsed.success
            ? await tool.run(parsed.data)
            : { content: [{ type: "text", text: `Bad arguments for ${tool.name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}` }], isError: true };
        }
        const out = resultText(res);
        await t.hub.emit({ kind: "tool_result", id: `${c.id}:result`, ok: !res.isError, summary: out.trim().slice(0, 4000) });
        messages.push({ role: "tool", tool_call_id: c.id, content: res.isError ? `Error: ${out}` : out });
        if (t.signal.aborted) throw new Error("Stopped.");
      }
      await save();
    }
    if (!r.ok) r.error = "error_max_turns";
  } catch (e) {
    r.error = t.signal.aborted ? "Stopped." : String(e instanceof Error ? e.message : e);
    answerAll(messages);
  }
  await save();
  return r;
}
