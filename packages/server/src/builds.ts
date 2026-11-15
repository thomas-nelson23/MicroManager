/** Building a project: the sketch with arduino-cli, the screen with Nextion Editor on the VM. */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.ts";
import {
  type BuildPart,
  type BuildRecord,
  listBuilds,
  nextBuildNumber,
  projectDir,
  readMeta,
  writeBuild,
} from "./projects.ts";

interface RunResult {
  code: number;
  out: string;
}

function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    const t = setTimeout(() => p.kill("SIGKILL"), opts.timeoutMs ?? 300_000);
    p.on("error", (e) => {
      clearTimeout(t);
      resolve({ code: -1, out: out + String(e) });
    });
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? -1, out });
    });
  });
}

const tail = (s: string, n = 2500) => (s.length > n ? "…" + s.slice(-n) : s).trim();

export async function buildSketch(id: string, outDir: string): Promise<BuildPart> {
  const meta = await readMeta(id);
  const t0 = Date.now();
  const r = await run(config.arduinoCli, [
    "compile",
    "--fqbn",
    meta.board.fqbn,
    "--output-dir",
    path.join(outDir, "arduino"),
    path.join(projectDir(id), "sketch"),
  ]);
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  if (r.code !== 0) return { ok: false, seconds, error: tail(r.out) };
  const m = /uses (\d+) bytes .* Maximum is (\d+) bytes/.exec(r.out);
  await fs.copyFile(path.join(outDir, "arduino", "sketch.ino.hex"), path.join(outDir, "sketch.hex"));
  await fs.rm(path.join(outDir, "arduino"), { recursive: true, force: true });
  return { ok: true, file: "sketch.hex", seconds, bytes: m ? Number(m[1]) : undefined, max: m ? Number(m[2]) : undefined };
}

export async function buildScreen(id: string, outDir: string): Promise<BuildPart> {
  const meta = await readMeta(id);
  const vm = config.vm;
  if (!vm.host || !vm.jobRoot) return { ok: false, error: "The Nextion VM isn't configured (VM_HOST, VM_USER, VM_JOBROOT)." };
  const t0 = Date.now();
  const work = path.join(outDir, "screen-work");
  const r = await run(
    "bash",
    [path.join(config.serverRoot, "nextion", "nxbuild.sh"), path.join(projectDir(id), "nextion"), id, work],
    {
      env: {
        VM_HOST: vm.host.includes("@") ? vm.host : `${vm.user}@${vm.host}`,
        VM_USER: vm.user,
        VM_JOBROOT: vm.jobRoot,
        VM_EDITOR: vm.editor,
        BUILD_TIMEOUT: String(vm.buildTimeout),
        DISPLAY_SERIES: meta.display.series,
        DISPLAY_MODEL: meta.display.model,
        ...(vm.sshKey ? { SSH_KEY: vm.sshKey } : {}),
      },
      timeoutMs: (vm.buildTimeout + 120) * 1000,
    },
  );
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  const tft = path.join(work, `${id}.tft`);
  const hmi = path.join(work, `${id}.HMI`);
  const hasTft = await fs.stat(tft).then(() => true, () => false);
  if (await fs.stat(hmi).then(() => true, () => false)) await fs.rename(hmi, path.join(outDir, "screen.HMI"));
  let part: BuildPart;
  if (r.code === 0 && hasTft) {
    await fs.rename(tft, path.join(outDir, "screen.tft"));
    part = { ok: true, file: "screen.tft", seconds, bytes: (await fs.stat(path.join(outDir, "screen.tft"))).size };
  } else {
    // nxbuild prints validator errors as "ERROR: …" lines and VM failures as one "ERROR:" line.
    const errors = r.out.split("\n").filter((l) => /^(ERROR|WARN):/.test(l));
    part = { ok: false, seconds, error: tail(errors.length ? errors.join("\n") : r.out) };
  }
  await fs.rm(work, { recursive: true, force: true });
  return part;
}

/** Build one or both halves into a new numbered build folder. */
export async function build(id: string, target: "sketch" | "screen" | "both", label: string): Promise<BuildRecord> {
  const n = await nextBuildNumber(id);
  const outDir = path.join(projectDir(id), "builds", String(n));
  await fs.mkdir(outDir, { recursive: true });
  const rec: BuildRecord = { n, label: label.slice(0, 80) || `Build ${n}`, createdAt: new Date().toISOString() };
  const [sketch, screen] = await Promise.all([
    target !== "screen" ? buildSketch(id, outDir) : undefined,
    target !== "sketch" ? buildScreen(id, outDir) : undefined,
  ]);
  if (sketch) rec.sketch = sketch;
  if (screen) rec.screen = screen;
  // carry the other half forward so every build is flashable as a whole
  const prev = (await listBuilds(id)).find((b) => b.n < n);
  for (const half of ["sketch", "screen"] as const) {
    const p = prev?.[half];
    if (!rec[half] && p?.ok && p.file) {
      await fs.copyFile(path.join(projectDir(id), "builds", String(prev!.n), p.file), path.join(outDir, p.file));
      rec[half] = { ...p, error: undefined, fromBuild: p.fromBuild ?? prev!.n };
    }
  }
  await writeBuild(id, rec);
  return rec;
}
