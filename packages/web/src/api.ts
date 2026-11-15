/** REST calls and shared types for the web UI. */

export interface ProjectMeta {
  id: string;
  title: string;
  description: string;
  board: { fqbn: string; name: string };
  display: { series: string; model: string; width: number; height: number };
  createdAt: string;
  updatedAt: string;
}

export interface BuildPart {
  ok: boolean;
  file?: string;
  bytes?: number;
  max?: number;
  seconds?: number;
  error?: string;
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

export interface ProjectDetail {
  meta: ProjectMeta;
  files: { path: string; bytes: number }[];
  builds: BuildRecord[];
  hmi: string;
  hardware: string;
  sketch: string;
  fonts: { index: number; height: number }[];
  busy: boolean;
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error ?? r.statusText);
  return r.json();
}

export const api = {
  projects: () => fetch("/api/projects").then((r) => json<ProjectMeta[]>(r)),
  project: (id: string) => fetch(`/api/projects/${id}`).then((r) => json<ProjectDetail>(r)),
  create: (title: string) =>
    fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) }).then((r) =>
      json<ProjectMeta>(r),
    ),
  markFlashed: (id: string, n: number, parts: { sketch: boolean; screen: boolean }) =>
    fetch(`/api/projects/${id}/builds/${n}/flashed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parts) }),
  buildFileUrl: (id: string, n: number, file: string) => `/api/projects/${id}/builds/${n}/${file}`,
};

export function ago(iso: string | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const kb = (bytes?: number) => (bytes === undefined ? "" : bytes >= 10240 ? `${Math.round(bytes / 1024)}` : (bytes / 1024).toFixed(1));
