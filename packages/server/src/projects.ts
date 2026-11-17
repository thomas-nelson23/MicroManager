/** Projects as plain folders: project.json, sketch/, nextion/, hardware.md, builds/<n>/. */
import fs from "node:fs/promises";
import path from "node:path";
import { type Board, boardById, boardByFqbn } from "./boards.ts";
import { config, projectsDir } from "./config.ts";
import { type DisplayModel, displayByModel } from "./displays.ts";
import { retargetHmi } from "./hmi-compact.ts";
import { formatWiring, parseWiring, remapWiring, stripHardwareTable, type Wiring, wiringFromHardwareMd } from "./wiring.ts";

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
  /** When that session last finished a turn, and how big its context was then (tokens). */
  sessionAt?: string;
  sessionContext?: number;
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
  /** What the build was made for (FQBN and display model), to spot builds from before a hardware change. */
  board?: string;
  display?: string;
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

const toMetaDisplay = (d: DisplayModel) => ({ series: d.series, model: d.model, width: d.width, height: d.height });

const boardFile = (b: Board, file: string) => path.join(config.serverRoot, "boards", b.id, file);

export async function createProject(title: string, description = "", boardId?: string, displayModel?: string): Promise<ProjectMeta> {
  const board = (boardId && boardById(boardId)) || boardByFqbn(config.defaults.board.fqbn);
  const display = displayModel ? displayByModel(displayModel) : undefined;
  await fs.mkdir(projectsDir(), { recursive: true });
  const id = await freeId(title);
  const dir = projectDir(id);
  await fs.cp(path.join(config.serverRoot, "template"), dir, { recursive: true });
  await fs.mkdir(path.join(dir, "builds"), { recursive: true });
  if (board) await fs.copyFile(boardFile(board, "hardware.md"), path.join(dir, "hardware.md"));
  else await fs.writeFile(path.join(dir, "hardware.md"), "# Hardware\n\nDisplay: Nextion on Serial1 at 9600 baud.\n");
  if (board) await fs.copyFile(boardFile(board, "wiring.json"), path.join(dir, "wiring.json"));
  else await fs.writeFile(path.join(dir, "wiring.json"), '{"connections": []}\n');
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    id,
    title: title.trim() || "New project",
    description,
    board: board ? { fqbn: board.fqbn, name: board.name } : { ...config.defaults.board },
    display: display ? toMetaDisplay(display) : { ...config.defaults.display },
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
  // Same for wiring.json: a project still on the old board's stock wiring gets the new board's.
  const wj = path.join(dir, "wiring.json");
  const [curW, oldW] = await Promise.all([
    fs.readFile(wj, "utf8").catch(() => null),
    old ? fs.readFile(boardFile(old, "wiring.json"), "utf8").catch(() => null) : null,
  ]);
  if (curW !== null ? curW === oldW : !cur.trim() || cur === oldTpl) await fs.copyFile(boardFile(board, "wiring.json"), wj);
  else if (curW !== null && old) {
    // A customised wiring keeps its parts; the pins are renamed for the new board here, not by Claude.
    const { wiring, error } = parseWiring(curW);
    if (!error) await fs.writeFile(wj, formatWiring(remapWiring(wiring, old, board)));
  }
  await fs.copyFile(path.join(config.serverRoot, "template", "sketch", "NexPass.h"), path.join(dir, "sketch", "NexPass.h"));
  meta.board = { fqbn: board.fqbn, name: board.name };
  await writeMeta(meta);
}

/**
 * Switch a project to another display. The screen is carried over here, not by Claude: positions and
 * sizes are scaled to the new resolution, and the old model is dropped from the settings line.
 */
export async function setDisplay(meta: ProjectMeta, display: DisplayModel): Promise<void> {
  const hmi = path.join(projectDir(meta.id), "nextion", "hmi.txt");
  const cur = await fs.readFile(hmi, "utf8").catch(() => null);
  if (cur !== null) {
    const next = retargetHmi(cur, meta.display, display);
    if (next !== cur) await fs.writeFile(hmi, next);
  }
  meta.display = toMetaDisplay(display);
  await writeMeta(meta);
}

/**
 * The project's wiring, from wiring.json. An older project, whose wiring is a table in hardware.md,
 * is converted on first read (the table moves into wiring.json), so Claude never has to do it.
 */
export async function readWiring(id: string): Promise<{ wiring: Wiring; source: "file" | "hardware.md"; error?: string }> {
  const dir = projectDir(id);
  const text = await fs.readFile(path.join(dir, "wiring.json"), "utf8").catch(() => null);
  if (text !== null) return { ...parseWiring(text), source: "file" };
  const md = await fs.readFile(path.join(dir, "hardware.md"), "utf8").catch(() => "");
  const wiring = wiringFromHardwareMd(md);
  await fs.writeFile(path.join(dir, "wiring.json"), formatWiring(wiring));
  if (wiring.connections.length) await fs.writeFile(path.join(dir, "hardware.md"), stripHardwareTable(md));
  return { wiring, source: "file" };
}

/** Write the project's wiring. */
export async function writeWiring(id: string, wiring: Wiring): Promise<void> {
  await fs.writeFile(path.join(projectDir(id), "wiring.json"), formatWiring(wiring));
}

export interface ProjectSummary extends ProjectMeta {
  lastBuild?: { n: number; ok: boolean; createdAt: string };
  onDevice?: number;
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const metas = await listProjects();
  return Promise.all(
    metas.map(async ({ sessionId: _s, ...m }) => {
      const builds = await listBuilds(m.id).catch(() => []);
      const b = builds[0];
      const flashed = builds.filter((x) => x.flashed?.sketch || x.flashed?.screen).sort((x, y) => ((y.flashed!.sketch ?? y.flashed!.screen)! > (x.flashed!.sketch ?? x.flashed!.screen)! ? 1 : -1))[0];
      return {
        ...m,
        ...(b ? { lastBuild: { n: b.n, ok: (!b.sketch || b.sketch.ok) && (!b.screen || b.screen.ok), createdAt: b.createdAt } } : {}),
        ...(flashed ? { onDevice: flashed.n } : {}),
      };
    }),
  );
}

async function freeId(title: string): Promise<string> {
  let id = slugify(title);
  for (let i = 2; await exists(path.join(projectsDir(), id)); i++) id = `${slugify(title).slice(0, 36)}-${i}`;
  return id;
}

/** Copy a project's sources (not its builds or its conversation) into a new project. */
export async function duplicateProject(srcId: string, title: string): Promise<ProjectMeta> {
  const src = await readMeta(srcId);
  const id = await freeId(title);
  const dir = projectDir(id);
  await fs.cp(projectDir(srcId), dir, {
    recursive: true,
    filter: (p) => {
      const rel = path.relative(projectDir(srcId), p);
      return !(rel === "builds" || rel.startsWith(`builds${path.sep}`) || rel === "uploads" || rel.startsWith(`uploads${path.sep}`) || path.basename(rel).startsWith(".chat"));
    },
  });
  await fs.mkdir(path.join(dir, "builds"), { recursive: true });
  const now = new Date().toISOString();
  const { sessionId: _s, sessionAt: _a, sessionContext: _c, ...rest } = src;
  const meta: ProjectMeta = { ...rest, id, title: title.trim() || `${src.title} copy`, createdAt: now, updatedAt: now };
  await writeMeta(meta);
  return meta;
}

/** Remove a project from the list. Its folder is moved to <data>/trash, not erased. */
export async function deleteProject(id: string): Promise<void> {
  const trash = path.join(config.dataDir, "trash");
  await fs.mkdir(trash, { recursive: true });
  await fs.rename(projectDir(id), path.join(trash, `${id}-${Date.now()}`));
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
        if (r === "builds" || r === "nextion/out" || r === "uploads") continue;
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
