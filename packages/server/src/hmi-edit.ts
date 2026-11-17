/**
 * Change attributes of one page or component in hmi.txt from the page's screen inspector, touching only
 * that element's line so the file stays in the one-element-per-line compact format Claude edits.
 */

import { parseHmi } from "./hmi-model.ts";

export interface AttrChange {
  page: string;
  /** Component name; leave out to change the page itself. */
  name?: string;
  /** New values; null removes the attribute (back to the component's default). */
  attrs: Record<string, string | number | null>;
}

const RESERVED = new Set(["page", "obj", "name", "on", "com"]);
const NUMERIC = /^-?\d+$/;

/** One element as a line: {"key": value, ...}, the way the guide writes them. */
export function elementLine(e: unknown): string {
  if (Array.isArray(e)) return `[${e.map(elementLine).join(", ")}]`;
  if (e && typeof e === "object") return `{${Object.entries(e).map(([k, v]) => `${JSON.stringify(k)}: ${elementLine(v)}`).join(", ")}}`;
  return JSON.stringify(e);
}

export class HmiEditError extends Error {}

export function applyAttrChange(text: string, change: AttrChange): string {
  for (const k of Object.keys(change.attrs)) {
    if (RESERVED.has(k) || !/^[a-z_][a-z0-9_]*$/i.test(k)) throw new HmiEditError(`can't set "${k}" here`);
  }
  const lines = text.split("\n");
  let page: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(\{.*\})(\s*,?\s*)$/.exec(lines[i]!);
    if (!m) continue;
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(m[2]!);
    } catch {
      continue;
    }
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    if (e.com === "addpage") page = String(e.pagename);
    if ("page" in e) page = String(e.page);
    const hit = page === change.page && (change.name === undefined ? "page" in e : "obj" in e && String(e.name) === change.name);
    if (!hit) continue;
    for (const [k, v] of Object.entries(change.attrs)) {
      if (v === null) delete e[k];
      else {
        // Numbers stay numbers (as Claude writes them), except text.
        const asNumber = typeof v === "number" || (k !== "txt" && NUMERIC.test(v) && typeof e[k] !== "string");
        e[k] = asNumber ? Number(v) : String(v);
      }
    }
    // keep "on" last
    if ("on" in e) {
      const on = e.on;
      delete e.on;
      e.on = on;
    }
    lines[i] = m[1] + elementLine(e) + m[3];
    const out = lines.join("\n");
    JSON.parse(out); // never write a broken file
    return out;
  }
  const what = change.name ? `component ${change.name} on page ${change.page}` : `page ${change.page}`;
  const pg = parseHmi(text).pages.find((p) => p.name === change.page);
  if (!pg || (change.name !== undefined && !pg.objects.some((o) => o.name === change.name))) {
    throw new HmiEditError(`there is no ${what} in hmi.txt any more (renamed or removed?). Reload and try again.`);
  }
  throw new HmiEditError(`${what} isn't on a line of its own in hmi.txt (older screens use editor commands). Ask Claude to convert the screen to the compact format first.`);
}
