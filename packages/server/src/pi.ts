/**
 * Raspberry Pi projects: the program is Python (pi/main.py), the server deploys it over SSH and reaches
 * the display through it, so nothing goes through the browser. On the Pi everything lives in
 * ~/nextion-app: current/ (the program), tools/ (nexctl.py, nexpass.py), app.log, and the user service
 * nextion-app that runs it. pi/remote.sh does the Pi's side of a deploy.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "./config.ts";
import type { ProjectMeta } from "./projects.ts";

export const PI_TOOLS = path.join(config.serverRoot, "pi");

/** The Pi a project deploys to (user@host), or "" when none is set. */
export const piHost = (meta: Pick<ProjectMeta, "pi">) => (meta.pi?.host?.trim() || config.pi.host).trim();

/** A plain user@host (or host), so it can't smuggle ssh options. */
export const validPiHost = (h: string) => /^([a-z_][a-z0-9_.-]{0,31}@)?[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(h);

const NO_HOST = "No Raspberry Pi is set for this project: set its address (user@host) next to the board picker, or PI_HOST on the server.";

/** One operation per Pi at a time: a screen upload stops the program, which a display command would need. */
const queues = new Map<string, Promise<unknown>>();
export function onePerPi<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(host) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(host, next.catch(() => {}));
  return next;
}

interface Result {
  code: number;
  out: string;
  err: string;
}

/** Run `remote` on the Pi over SSH, with `input` on its stdin. */
export function ssh(host: string, remote: string, opts: { input?: Buffer | string; timeoutMs?: number; onErr?: (chunk: string) => void } = {}): Promise<Result> {
  const args = ["-o", "BatchMode=yes", "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=accept-new"];
  if (config.vm.sshKey) args.push("-i", config.vm.sshKey);
  args.push("--", host, remote);
  return new Promise((resolve) => {
    const p = spawn("ssh", args);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => {
      err += d;
      opts.onErr?.(String(d));
    });
    const t = setTimeout(() => p.kill("SIGKILL"), opts.timeoutMs ?? 60_000);
    p.on("error", (e) => {
      clearTimeout(t);
      resolve({ code: -1, out, err: err + String(e) });
    });
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? -1, out, err });
    });
    p.stdin.on("error", () => {});
    p.stdin.end(opts.input ?? "");
  });
}

/** What ssh itself said went wrong (unreachable, key refused), in a sentence. */
function sshError(r: Result, host: string): string | undefined {
  if (r.code !== 255) return undefined;
  const e = r.err.trim();
  if (/Permission denied/i.test(e)) return `The Pi at ${host} refused the app's SSH key. Add the key to ~/.ssh/authorized_keys on the Pi (see the setup notes).`;
  if (/Could not resolve|Name or service not known/i.test(e)) return `Couldn't find a Pi called ${host} on the network.`;
  if (/timed out|No route|refused/i.test(e)) return `Couldn't reach the Pi at ${host} (${e.split("\n").pop()}). Is it on and is SSH enabled?`;
  return `SSH to ${host} failed: ${e || "unknown error"}`;
}

const run = (cmd: string, args: string[], cwd?: string) =>
  new Promise<Result>((resolve) => {
    const p = spawn(cmd, args, { cwd });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => resolve({ code: -1, out, err: String(e) }));
    p.on("close", (code) => resolve({ code: code ?? -1, out, err }));
  });

/**
 * "Build" a Pi program: copy the app's current nexpass.py next to it, check that every .py file
 * compiles, and pack pi/ into app.tar.gz. Errors read like a compiler's: file, line, message.
 */
export async function buildPiProgram(src: string, outFile: string): Promise<{ ok: boolean; error?: string; bytes?: number }> {
  if (!(await fs.stat(path.join(src, "main.py")).then(() => true, () => false))) return { ok: false, error: "pi/main.py is missing" };
  const latest = await fs.readFile(path.join(PI_TOOLS, "nexpass.py"), "utf8");
  const cur = await fs.readFile(path.join(src, "nexpass.py"), "utf8").catch(() => null);
  if (cur !== latest) await fs.writeFile(path.join(src, "nexpass.py"), latest);
  const check = await run("python3", ["-I", "-c", PY_CHECK, src]);
  if (check.code !== 0) return { ok: false, error: (check.out + check.err).trim().slice(-2500) || "python3 failed" };
  const r = await run("tar", ["-czf", outFile, "--exclude=__pycache__", "--exclude=*.pyc", "--exclude=./.*", "-C", src, "."]);
  if (r.code !== 0) return { ok: false, error: r.err.trim() || "tar failed" };
  return { ok: true, bytes: (await fs.stat(outFile)).size };
}

// Compile every .py file under the folder (no bytecode written), reporting each error as "file:line: message".
const PY_CHECK = `
import os, sys
root = sys.argv[1]
bad = 0
for d, dirs, files in os.walk(root):
    dirs[:] = [x for x in dirs if not x.startswith(".") and x != "__pycache__"]
    for f in sorted(files):
        if not f.endswith(".py"):
            continue
        p = os.path.join(d, f)
        try:
            compile(open(p, encoding="utf-8").read(), p, "exec")
        except SyntaxError as e:
            bad += 1
            print(f"pi/{os.path.relpath(p, root)}:{e.lineno}:{e.offset or 0}: {e.msg}")
            if e.text:
                print("    " + e.text.rstrip())
sys.exit(1 if bad else 0)
`;

export interface DeployResult {
  ok: boolean;
  message: string;
}

/**
 * Put a build on the Pi: the program (app.tar.gz) and/or the screen (screen.tft), with the app's tools,
 * piped over SSH as one bundle that pi/remote.sh unpacks. `progress` gets screen upload progress.
 */
export async function deployToPi(
  meta: ProjectMeta,
  files: { app?: string; tft?: string },
  progress?: (done: number, total: number) => void,
): Promise<DeployResult> {
  const host = piHost(meta);
  if (!host) return { ok: false, message: NO_HOST };
  if (!validPiHost(host)) return { ok: false, message: `"${host}" isn't a valid Pi address; use user@host.` };
  return onePerPi(host, () => deploy(host, meta, files, progress));
}

async function deploy(host: string, meta: ProjectMeta, files: { app?: string; tft?: string }, progress?: (done: number, total: number) => void): Promise<DeployResult> {
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), "pideploy-"));
  try {
    await fs.mkdir(path.join(stage, "tools"));
    await Promise.all([
      fs.copyFile(path.join(PI_TOOLS, "nexctl.py"), path.join(stage, "tools", "nexctl.py")),
      fs.copyFile(path.join(PI_TOOLS, "nexpass.py"), path.join(stage, "tools", "nexpass.py")),
      fs.copyFile(path.join(PI_TOOLS, "remote.sh"), path.join(stage, "remote.sh")),
      files.app ? fs.copyFile(files.app, path.join(stage, "app.tar.gz")) : undefined,
      files.tft ? fs.copyFile(files.tft, path.join(stage, "screen.tft")) : undefined,
    ]);
    const tar = await run("tar", ["-czf", path.join(os.tmpdir(), `${path.basename(stage)}.tgz`), "-C", stage, "."]);
    if (tar.code !== 0) return { ok: false, message: `couldn't pack the deploy: ${tar.err.trim()}` };
    const bundle = await fs.readFile(path.join(os.tmpdir(), `${path.basename(stage)}.tgz`));
    await fs.rm(path.join(os.tmpdir(), `${path.basename(stage)}.tgz`), { force: true });
    const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    const remote = `D="$HOME/nextion-app"; rm -rf "$D/incoming" && mkdir -p "$D/incoming" && tar -xzf - -C "$D/incoming" && bash "$D/incoming/remote.sh" ${q(meta.display.model)} ${config.pi.uploadBaud}`;
    let errBuf = "";
    const r = await ssh(host, remote, {
      input: bundle,
      timeoutMs: (files.tft ? 15 * 60 : 3 * 60) * 1000,
      onErr: (chunk) => {
        errBuf += chunk;
        const m = [...errBuf.matchAll(/progress (\d+) (\d+)/g)].pop();
        if (m && progress) progress(Number(m[1]), Number(m[2]));
        errBuf = errBuf.slice(-200);
      },
    });
    const bad = sshError(r, host);
    if (bad) return { ok: false, message: bad };
    const lines = r.out.split("\n").map((l) => l.trim()).filter(Boolean);
    // nexctl's JSON line explains a failed upload better than remote.sh's summary
    const nexErr = lines.map((l) => (l.startsWith("{") ? (JSON.parse(l) as { ok?: boolean; error?: string }) : null)).find((j) => j && j.ok === false)?.error;
    if (r.code !== 0) {
      const err = lines.filter((l) => !l.startsWith("{") && !l.startsWith("OK:"));
      return { ok: false, message: [nexErr, ...err.map((l) => l.replace(/^ERROR: /, ""))].filter(Boolean).join("\n").slice(-2000) || `the deploy failed (exit ${r.code})` };
    }
    const warn = lines.filter((l) => l.startsWith("WARN:")).map((l) => l.slice(6));
    const did = [files.app && "program running", files.tft && "screen uploaded"].filter(Boolean).join(", ");
    return { ok: true, message: `on the Pi at ${host}: ${did}${warn.length ? `. Note: ${warn.join(" ")}` : ""}` };
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

/**
 * Display commands on the Pi, through the running program (or straight to the UART when none runs).
 * Returns the same reply shapes as the browser's device runner.
 */
export async function piDisplay(meta: ProjectMeta, commands: string[], listenSeconds = 0): Promise<{ ok: boolean; replies?: unknown[]; error?: string; note?: string }> {
  const host = piHost(meta);
  if (!host) return { ok: false, error: NO_HOST };
  if (!validPiHost(host)) return { ok: false, error: `"${host}" isn't a valid Pi address; use user@host.` };
  const r = await onePerPi(host, () =>
    ssh(host, `python3 "$HOME/nextion-app/tools/nexctl.py" run`, {
      input: JSON.stringify({ commands, listen: listenSeconds }),
      timeoutMs: (20 + commands.length * 4 + listenSeconds) * 1000,
    }),
  );
  const bad = sshError(r, host);
  if (bad) return { ok: false, error: bad };
  if (/No such file/.test(r.err) && /nexctl/.test(r.err)) return { ok: false, error: "The app's tools aren't on the Pi yet: deploy the program once first." };
  const line = r.out.trim().split("\n").pop() ?? "";
  try {
    return JSON.parse(line);
  } catch {
    return { ok: false, error: (r.err || r.out).trim().slice(-800) || `nexctl failed (exit ${r.code})` };
  }
}

/** The program's recent output on the Pi (its log), for the device console and for Claude. */
export async function piLog(meta: ProjectMeta, lines = 60): Promise<{ ok: boolean; text: string }> {
  const host = piHost(meta);
  if (!host) return { ok: false, text: NO_HOST };
  if (!validPiHost(host)) return { ok: false, text: `"${host}" isn't a valid Pi address; use user@host.` };
  const n = Math.max(1, Math.min(400, Math.round(lines)));
  const r = await ssh(host, `systemctl --user is-active nextion-app 2>/dev/null | sed 's/^/service: /'; tail -n ${n} "$HOME/nextion-app/app.log" 2>/dev/null`, { timeoutMs: 20_000 });
  const bad = sshError(r, host);
  if (bad) return { ok: false, text: bad };
  return { ok: true, text: r.out.trim() };
}
