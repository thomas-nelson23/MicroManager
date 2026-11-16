/** Projects as plain folders: project.json, sketch/, nextion/, hardware.md, builds/<n>/. */
import fs from "node:fs/promises";
import path from "node:path";
import { type Board, boardById, boardByFqbn } from "./boards.ts";
import { config, projectsDir } from "./config.ts";

export interface ProjectMeta {
  id: string;
  title: string;
  description: string;
  board: { fqbn: string; name: string };
  display: { series: string; model: string; width: number; height: number };
  createdAt: string;
  updatedAt: string;
  /** Claude Agent SDK session to resume, once the first message was sent. */
  sessionId?: string;
}

export interface BuildPart {
  ok: boolean;
  file?: string; // file name inside the build folder
  bytes?: number;
  max?: number;
  seconds?: number;
  error?: string;
  /** Unchanged half copied from an earlier build. */
  fromBuild?: number;
}

export interface BuildRecord {
  n: number;
  label: string;
  createdAt: string;
  sketch?: BuildPart;
  screen?: BuildPart;
  flashed?: { sketch?: string; screen?: string };
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

export function projectDir(id: string): string {
  if (!ID_RE.test(id)) throw new Error(`bad project id: ${id}`);
  return path.join(projectsDir(), id);
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project"
  );
}

async function exists(p: string) {
  return fs.access(p).then(
    () => true,
    () => false,
  );
}

export async function readMeta(id: string): Promise<ProjectMeta> {
  return JSON.parse(await fs.readFile(path.join(projectDir(id), "project.json"), "utf8"));
}

export async function writeMeta(meta: ProjectMeta): Promise<void> {
  meta.updatedAt = new Date().toISOString();
  await fs.writeFile(path.join(projectDir(meta.id), "project.json"), JSON.stringify(meta, null, 2) + "\n");
}

export async function listProjects(): Promise<ProjectMeta[]> {
  await fs.mkdir(projectsDir(), { recursive: true });
  const out: ProjectMeta[] = [];
  for (const id of await fs.readdir(projectsDir())) {
    if (!ID_RE.test(id)) continue;
    try {
      out.push(await readMeta(id));
    } catch {
      /* not a project folder */
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const boardFile = (b: Board, file: string) => path.join(config.serverRoot, "boards", b.id, file);

export async function createProject(title: string, description = "", boardId?: string): Promise<ProjectMeta> {
  const board = (boardId && boardById(boardId)) || boardByFqbn(config.defaults.board.fqbn);
  await fs.mkdir(projectsDir(), { recursive: true });
  let id = slugify(title);
  for (let i = 2; await exists(path.join(projectsDir(), id)); i++) id = `${slugify(title).slice(0, 36)}-${i}`;
  const dir = projectDir(id);
  await fs.cp(path.join(config.serverRoot, "template"), dir, { recursive: true });
  await fs.mkdir(path.join(dir, "builds"), { recursive: true });
  if (board) await fs.copyFile(boardFile(board, "hardware.md"), path.join(dir, "hardware.md"));
  else await fs.writeFile(path.join(dir, "hardware.md"), "# Hardware\n\nDisplay: Nextion on Serial1 at 9600 baud.\n");
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    id,
    title: title.trim() || "New project",
    description,
    board: board ? { fqbn: board.fqbn, name: board.name } : { ...config.defaults.board },
    display: { ...config.defaults.display },
    createdAt: now,
    updatedAt: now,
  };
  await writeMeta(meta);
  return meta;
}

/**
 * Switch a project to another board. NexPass.h is refreshed from the template (it is a library the
 * sketch must not edit, and newer copies know more boards); hardware.md is replaced only while it is
 * still the old board's untouched template.
 */
export async function setBoard(meta: ProjectMeta, board: Board): Promise<void> {
  const dir = projectDir(meta.id);
  const old = boardByFqbn(meta.board.fqbn);
  const hw = path.join(dir, "hardware.md");
  const [cur, oldTpl] = await Promise.all([
    fs.readFile(hw, "utf8").catch(() => ""),
    old ? fs.readFile(boardFile(old, "hardware.md"), "utf8").catch(() => null) : null,
  ]);
  if (!cur.trim() || cur === oldTpl) await fs.copyFile(boardFile(board, "hardware.md"), hw);
  await fs.copyFile(path.join(config.serverRoot, "template", "sketch", "NexPass.h"), path.join(dir, "sketch", "NexPass.h"));
  meta.board = { fqbn: board.fqbn, name: board.name };
  await writeMeta(meta);
}

export async function listBuilds(id: string): Promise<BuildRecord[]> {
  const dir = path.join(projectDir(id), "builds");
  await fs.mkdir(dir, { recursive: true });
  const out: BuildRecord[] = [];
  for (const name of await fs.readdir(dir)) {
    if (!/^\d+$/.test(name)) continue;
    try {
      out.push(JSON.parse(await fs.readFile(path.join(dir, name, "build.json"), "utf8")));
    } catch {
      /* incomplete build */
    }
  }
  return out.sort((a, b) => b.n - a.n);
}

export async function writeBuild(id: string, b: BuildRecord): Promise<void> {
  const dir = path.join(projectDir(id), "builds", String(b.n));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "build.json"), JSON.stringify(b, null, 2) + "\n");
}

export async function nextBuildNumber(id: string): Promise<number> {
  const builds = await listBuilds(id);
  return (builds[0]?.n ?? 0) + 1;
}

export interface FileEntry {
  path: string;
  bytes: number;
}

/** Project files (sources only: no builds, no hidden files). */
export async function listFiles(id: string): Promise<FileEntry[]> {
  const root = projectDir(id);
  const out: FileEntry[] = [];
  async function walk(rel: string) {
    for (const ent of await fs.readdir(path.join(root, rel), { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (r === "builds" || r === "nextion/out") continue;
        await walk(r);
      } else {
        out.push({ path: r, bytes: (await fs.stat(path.join(root, r))).size });
      }
    }
  }
  await walk("");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Resolve a project-relative path safely (no escaping the project folder). */
export function safePath(id: string, rel: string): string {
  const root = projectDir(id);
  const p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error("path outside the project");
  return p;
}

/** Record that a build (or half of one) is now on the device. */
export async function markFlashed(id: string, n: number, sketch: boolean, screen: boolean): Promise<void> {
  const b = (await listBuilds(id)).find((x) => x.n === n);
  if (!b) return;
  const now = new Date().toISOString();
  b.flashed = { ...b.flashed, ...(sketch ? { sketch: now } : {}), ...(screen ? { screen: now } : {}) };
  await writeBuild(id, b);
}
