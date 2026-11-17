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

import type { Board } from "@nextion-arduino/server/boards";
import type { DisplayModel } from "@nextion-arduino/server/displays";
import type { Wiring } from "@nextion-arduino/server/wiring";
export type { Board, DisplayModel, Wiring };

export interface ProjectSummary extends ProjectMeta {
  lastBuild?: { n: number; ok: boolean; createdAt: string };
  onDevice?: number;
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
  board?: string;
  display?: string;
}

export interface ProjectDetail {
  meta: ProjectMeta;
  files: { path: string; bytes: number }[];
  builds: BuildRecord[];
  hmi: string;
  hardware: string;
  sketch: string;
  wiring: Wiring;
  wiringSource: "file" | "hardware.md";
  wiringError?: string;
  fonts: { index: number; height: number }[];
  busy: boolean;
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error ?? r.statusText);
  return r.json();
}

const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  projects: () => fetch("/api/projects").then((r) => json<ProjectSummary[]>(r)),
  project: (id: string) => fetch(`/api/projects/${id}`).then((r) => json<ProjectDetail>(r)),
  boards: () => fetch("/api/boards").then((r) => json<Board[]>(r)),
  displays: () => fetch("/api/displays").then((r) => json<DisplayModel[]>(r)),
  config: () => fetch("/api/config").then((r) => json<{ publicUrl: string }>(r)),
  create: (title: string, board?: string, display?: string) => send("/api/projects", "POST", { title, board, display }).then((r) => json<ProjectMeta>(r)),
  update: (id: string, patch: { title?: string; description?: string; board?: string; display?: string }) =>
    send(`/api/projects/${id}`, "PATCH", patch).then((r) => json<ProjectMeta>(r)),
  remove: (id: string) => send(`/api/projects/${id}`, "DELETE").then((r) => json<{ ok: boolean }>(r)),
  duplicate: (id: string, title: string) => send(`/api/projects/${id}/duplicate`, "POST", { title }).then((r) => json<ProjectMeta>(r)),
  newConversation: (id: string) => send(`/api/projects/${id}/conversation`, "POST").then((r) => json<{ ok: boolean }>(r)),
  file: (id: string, path: string) => fetch(`/api/projects/${id}/file?path=${encodeURIComponent(path)}`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.statusText)))),
  /** Build the project as it is on the server, without Claude. */
  rebuild: (id: string, target: "sketch" | "screen" | "both") => send(`/api/projects/${id}/builds`, "POST", { target, label: "rebuild" }).then((r) => json<BuildRecord>(r)),
  markFlashed: (id: string, n: number, parts: { sketch: boolean; screen: boolean }) => send(`/api/projects/${id}/builds/${n}/flashed`, "POST", parts),
  buildFileUrl: (id: string, n: number, file: string) => `/api/projects/${id}/builds/${n}/${file}`,
  uploadUrl: (id: string, path: string) => `/api/projects/${id}/upload/${path.replace(/^uploads\//, "")}`,
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
