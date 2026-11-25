/**
 * Read, Edit, Write, Glob, Grep (and Bash when ALLOW_BASH=1) on a project folder, for backends that don't bring
 * their own (the Hermes backend). Names and arguments match Claude Code's tools, so the guide and the chat's step
 * labels read the same for both backends. Every path stays inside the project folder.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { text, type BenchTool, type ToolResult } from "./bench.ts";

const MAX_LINES = 2000;
const MAX_LINE = 2000;
const PICTURE = /\.(png|jpe?g|webp|gif|bmp)$/i;
/** Folders the searches skip: build output and things no edit should touch. */
const SKIP_DIRS = new Set(["builds", "node_modules", ".git", "out"]);

/** Resolve a path the model gave (relative to the project, or absolute inside it), refusing anything outside, symlinks included. */
export function resolveIn(root: string, p: string): string {
  const realRoot = fs.realpathSync(root);
  const abs = path.resolve(root, p);
  const inside = (x: string, r: string) => x === r || x.startsWith(r + path.sep);
  if (!inside(abs, path.resolve(root))) throw new Error(`${p} is outside the project folder`);
  // the deepest existing ancestor must also resolve inside (a symlink pointing out of the project fails here)
  let probe = abs;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  if (!inside(fs.realpathSync(probe), realRoot)) throw new Error(`${p} is outside the project folder`);
  return abs;
}

/** A glob pattern as a regular expression over /-separated relative paths: **, *, ?, {a,b} and [...]. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      re += "(?:";
      depth++;
    } else if (c === "}" && depth) {
      re += ")";
      depth--;
    } else if (c === "," && depth) re += "|";
    else if (c === "[") {
      const end = glob.indexOf("]", i);
      if (end < 0) re += "\\[";
      else {
        re += `[${glob.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
        i = end;
      }
    } else re += c.replace(/[.+^$()|\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Files under dir (relative to root, /-separated), skipping build output and dot-folders. */
async function walk(root: string, dir: string, out: string[] = [], limit = 5000): Promise<string[]> {
  let ents: fs.Dirent[];
  try {
    ents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (out.length >= limit) break;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      await walk(root, abs, out, limit);
    } else if (e.isFile()) out.push(path.relative(root, abs).split(path.sep).join("/"));
  }
  return out;
}

function run(cmd: string, cwd: string, signal?: AbortSignal): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn("bash", ["-c", cmd], { cwd, timeout: 120_000, signal });
    let o = "";
    p.stdout.on("data", (d) => (o += d));
    p.stderr.on("data", (d) => (o += d));
    p.on("error", (e) => resolve({ code: 1, out: `${o}${e.message}` }));
    p.on("close", (code) => resolve({ code: code ?? 1, out: o }));
  });
}

const safe = (f: (...a: never[]) => Promise<ToolResult>) =>
  (async (...a: never[]) => {
    try {
      return await f(...a);
    } catch (e) {
      return text(String(e instanceof Error ? e.message : e), true);
    }
  }) as BenchTool["run"];

export function fileTools(root: string, opts: { bash?: boolean; signal?: AbortSignal } = {}): BenchTool[] {
  const rel = (abs: string) => path.relative(root, abs).split(path.sep).join("/") || ".";
  const tools: BenchTool[] = [
    {
      name: "Read",
      description: `Read a text file from the project. Lines come numbered (number, tab, text). For a big file, give offset and limit (at most ${MAX_LINES} lines are returned).`,
      shape: {
        file_path: z.string().describe("Path relative to the project folder"),
        offset: z.number().int().min(1).optional().describe("First line to read (1-based)"),
        limit: z.number().int().min(1).optional().describe("Number of lines"),
      },
      run: safe(async ({ file_path, offset, limit }: { file_path: string; offset?: number; limit?: number }) => {
        const abs = resolveIn(root, file_path);
        if (PICTURE.test(abs)) return text(`${rel(abs)} is a picture, and this model can't view pictures here. Ask the person what it shows if you need to know.`);
        const lines = (await fs.promises.readFile(abs, "utf8")).split("\n");
        const start = (offset ?? 1) - 1;
        const part = lines.slice(start, start + Math.min(limit ?? MAX_LINES, MAX_LINES));
        if (!part.length) return text(`(${rel(abs)} has ${lines.length} lines; nothing at line ${start + 1})`);
        const body = part.map((l, i) => `${String(start + i + 1).padStart(6)}\t${l.length > MAX_LINE ? l.slice(0, MAX_LINE) + "…" : l}`).join("\n");
        const more = start + part.length < lines.length ? `\n(${lines.length - start - part.length} more lines; use offset)` : "";
        return text(body + more);
      }),
    },
    {
      name: "Edit",
      description: "Replace exact text in a file. old_string must match the file exactly (indentation included, no line numbers) and occur once, unless replace_all is true.",
      shape: {
        file_path: z.string(),
        old_string: z.string().min(1),
        new_string: z.string(),
        replace_all: z.boolean().optional(),
      },
      run: safe(async ({ file_path, old_string, new_string, replace_all }: { file_path: string; old_string: string; new_string: string; replace_all?: boolean }) => {
        const abs = resolveIn(root, file_path);
        const cur = await fs.promises.readFile(abs, "utf8");
        const n = cur.split(old_string).length - 1;
        if (n === 0) return text(`old_string was not found in ${rel(abs)}. Read the lines again and copy them exactly.`, true);
        if (n > 1 && !replace_all) return text(`old_string occurs ${n} times in ${rel(abs)}. Add surrounding lines to make it unique, or set replace_all.`, true);
        const next = replace_all ? cur.split(old_string).join(new_string) : cur.replace(old_string, () => new_string);
        await fs.promises.writeFile(abs, next);
        return text(`Edited ${rel(abs)}${n > 1 ? ` (${n} places)` : ""}.`);
      }),
    },
    {
      name: "Write",
      description: "Create a file, or replace a whole file. Prefer Edit for changes to an existing file.",
      shape: { file_path: z.string(), content: z.string() },
      run: safe(async ({ file_path, content }: { file_path: string; content: string }) => {
        const abs = resolveIn(root, file_path);
        await fs.promises.mkdir(path.dirname(abs), { recursive: true });
        await fs.promises.writeFile(abs, content);
        return text(`Wrote ${rel(abs)} (${content.split("\n").length} lines).`);
      }),
    },
    {
      name: "Glob",
      description: "List project files matching a glob pattern, e.g. '**/*.ino' or 'nextion/*'.",
      shape: { pattern: z.string(), path: z.string().optional().describe("Folder to search in; defaults to the project folder") },
      run: safe(async ({ pattern, path: dir }: { pattern: string; path?: string }) => {
        const base = resolveIn(root, dir ?? ".");
        const re = globToRegExp(pattern.replace(/^\.\//, ""));
        const hits = (await walk(base, base)).filter((f) => re.test(f) || (!pattern.includes("/") && re.test(path.posix.basename(f))));
        const prefix = rel(base) === "." ? "" : `${rel(base)}/`;
        return text(hits.length ? hits.slice(0, 200).map((f) => prefix + f).join("\n") + (hits.length > 200 ? `\n(${hits.length - 200} more)` : "") : "No files found.");
      }),
    },
    {
      name: "Grep",
      description: "Search file contents with a regular expression. Returns matching lines as path:line: text (or only file names with output_mode 'files_with_matches').",
      shape: {
        pattern: z.string(),
        path: z.string().optional().describe("File or folder; defaults to the project folder"),
        glob: z.string().optional().describe("Only files matching this glob, e.g. '*.ino'"),
        "-i": z.boolean().optional().describe("Ignore case"),
        output_mode: z.enum(["content", "files_with_matches"]).optional(),
      },
      run: safe(async (a: { pattern: string; path?: string; glob?: string; "-i"?: boolean; output_mode?: "content" | "files_with_matches" }) => {
        const base = resolveIn(root, a.path ?? ".");
        const re = new RegExp(a.pattern, a["-i"] ? "i" : "");
        const only = a.glob ? globToRegExp(a.glob) : undefined;
        const stat = await fs.promises.stat(base);
        const files = stat.isFile() ? [path.basename(base)] : await walk(base, base);
        const dirOf = stat.isFile() ? path.dirname(base) : base;
        const out: string[] = [];
        for (const f of files) {
          if (out.length >= 200) break;
          if (only && !only.test(f) && !only.test(path.posix.basename(f))) continue;
          if (PICTURE.test(f) || /\.(tft|hex|bin|uf2|zi|elf)$/i.test(f)) continue;
          const abs = path.join(dirOf, f);
          const body = await fs.promises.readFile(abs, "utf8").catch(() => "");
          const name = rel(abs);
          const lines = body.split("\n");
          let any = false;
          for (let i = 0; i < lines.length && out.length < 200; i++) {
            if (!re.test(lines[i]!)) continue;
            any = true;
            if (a.output_mode === "files_with_matches") break;
            out.push(`${name}:${i + 1}: ${lines[i]!.slice(0, 300)}`);
          }
          if (any && a.output_mode === "files_with_matches") out.push(name);
        }
        return text(out.length ? out.join("\n") + (out.length >= 200 ? "\n(stopped at 200 results)" : "") : "No matches.");
      }),
    },
  ];
  if (opts.bash) {
    tools.push({
      name: "Bash",
      description: "Run a shell command in the project folder (2 minute limit).",
      shape: { command: z.string() },
      run: safe(async ({ command }: { command: string }) => {
        const r = await run(command, root, opts.signal);
        return text(r.out.trim().slice(-4000) || `(exit ${r.code})`, r.code !== 0);
      }),
    });
  }
  return tools;
}
