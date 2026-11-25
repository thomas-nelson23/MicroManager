/** Feature requests people write in the app, kept in <dataDir>/feature-requests.json. */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.ts";

export type FeatureKind = "feature" | "board" | "display" | "improvement" | "other";
export const FEATURE_KINDS: FeatureKind[] = ["feature", "board", "display", "improvement", "other"];

export interface FeatureRequest {
  id: string;
  title: string;
  details: string;
  kind: FeatureKind;
  createdAt: string;
  /** Set once the person has opened it as a GitHub issue from the app. */
  sentAt?: string;
}

const file = () => path.join(config.dataDir, "feature-requests.json");

export async function listFeatureRequests(): Promise<FeatureRequest[]> {
  try {
    const list = JSON.parse(await fs.readFile(file(), "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// One write at a time, so two quick submissions can't overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function update<T>(fn: (list: FeatureRequest[]) => T): Promise<T> {
  const next = queue.then(async () => {
    const list = await listFeatureRequests();
    const out = fn(list);
    await fs.mkdir(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(list, null, 2) + "\n");
    await fs.rename(tmp, file());
    return out;
  });
  queue = next.catch(() => {});
  return next;
}

/** Check and normalise a submission; returns an error message for bad input. */
export function parseFeatureRequest(body: unknown): { title: string; details: string; kind: FeatureKind } | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const details = typeof b.details === "string" ? b.details.trim() : "";
  const kind = FEATURE_KINDS.includes(b.kind as FeatureKind) ? (b.kind as FeatureKind) : "feature";
  if (!title) return "give the request a title";
  return { title: title.slice(0, 120), details: details.slice(0, 4000), kind };
}

export const addFeatureRequest = (r: { title: string; details: string; kind: FeatureKind }) =>
  update((list) => {
    const item: FeatureRequest = { id: randomUUID(), ...r, createdAt: new Date().toISOString() };
    list.unshift(item);
    return item;
  });

export const markFeatureRequestSent = (id: string) =>
  update((list) => {
    const item = list.find((r) => r.id === id);
    if (item) item.sentAt = new Date().toISOString();
    return item;
  });

export const deleteFeatureRequest = (id: string) =>
  update((list) => {
    const i = list.findIndex((r) => r.id === id);
    if (i >= 0) list.splice(i, 1);
    return i >= 0;
  });
