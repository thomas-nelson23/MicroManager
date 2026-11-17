/**
 * Parse nextion/hmi.txt (compact elements and/or Nextion Editor automation commands) into pages and
 * components. Shared by the web preview and the server's layout checks.
 */
import components from "../nextion/components.json" with { type: "json" };
import { expandHmi } from "./hmi-compact.ts";

export interface AttrDef {
  type: string;
  default?: string;
  min?: string;
  max?: string;
  desc?: string;
  /** The display accepts a new value while running (no build needed). */
  runtime_changeable?: boolean;
}
type CompDef = { id: string; atts: Record<string, AttrDef> };
const defs = components as unknown as Record<string, CompDef>;
const byId = new Map<number, { name: string; def: CompDef }>();
for (const [name, def] of Object.entries(defs)) if (/^\d+$/.test(def.id)) byId.set(Number(def.id), { name, def });

/** The attributes a component type has (from components.json), without the common x/y/w/h. */
export function attrDefs(type: number): Record<string, AttrDef> {
  return byId.get(type)?.def.atts ?? {};
}

/** Whether changing this attribute on the running display works (x, y, w, h and the like need a build). */
export function isRuntimeAttr(type: number, att: string): boolean {
  return attrDefs(type)[att]?.runtime_changeable === true;
}

export interface HmiObject {
  type: number;
  typeName: string;
  name: string;
  attrs: Record<string, string>;
  /** Attribute with the component's default as fallback. */
  get(att: string): string | undefined;
  num(att: string, fallback?: number): number;
}

export interface HmiPage {
  name: string;
  /** Page id (its position), as the display numbers it. */
  index: number;
  page: HmiObject;
  objects: HmiObject[];
}

function makeObj(type: number, name: string): HmiObject {
  const d = byId.get(type);
  const attrs: Record<string, string> = {};
  return {
    type,
    typeName: d?.name ?? `type ${type}`,
    name,
    attrs,
    get: (att) => attrs[att] ?? d?.def.atts[att]?.default,
    num(att, fallback = 0) {
      const v = Number(this.get(att));
      return Number.isFinite(v) ? v : fallback;
    },
  };
}

/** A copy of a component with some attributes replaced (unsaved inspector edits). */
export function withAttrs(o: HmiObject, extra: Record<string, string>): HmiObject {
  const c = makeObj(o.type, o.name);
  Object.assign(c.attrs, o.attrs, extra);
  return c;
}

/** RGB565 from 8-bit channels, and back to #rrggbb for color inputs. */
export function toRgb565(hex: string): number {
  const v = Number.parseInt(hex.replace("#", ""), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}
export function rgb565Hex(v: number): string {
  const r = Math.round((((v >> 11) & 0x1f) * 255) / 31);
  const g = Math.round((((v >> 5) & 0x3f) * 255) / 63);
  const b = Math.round(((v & 0x1f) * 255) / 31);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function parseHmi(text: string): { pages: HmiPage[]; error?: string } {
  let cmds: unknown;
  try {
    cmds = JSON.parse(text);
  } catch (e) {
    return { pages: [], error: `hmi.txt is not valid JSON: ${(e as Error).message}` };
  }
  if (!Array.isArray(cmds)) return { pages: [], error: "hmi.txt must be a JSON array" };
  let expanded;
  try {
    expanded = expandHmi(cmds.slice(1));
  } catch (e) {
    return { pages: [], error: `hmi.txt: ${(e as Error).message}` };
  }
  const pages: HmiPage[] = [];
  let cur: HmiPage | null = null;
  let sel: HmiObject | null = null;
  for (const { cmd: c } of expanded) {
    const com = c.com ?? "";
    if (com === "addpage") {
      const page = makeObj(121, String(c.pagename ?? `page${pages.length}`));
      cur = { name: page.name, index: pages.length, page, objects: [] };
      pages.push(cur);
      sel = page;
    } else if (!cur) continue;
    else if (com === "addobj") {
      sel = makeObj(Number(c.objtype), String(c.objname ?? ""));
      cur.objects.push(sel);
    } else if (com === "setatt" && sel) {
      const an = String(c.attname ?? "");
      const av = String(c.attval ?? "");
      if (an === "0") {
        const idx = Number(av);
        sel = idx === 0 ? cur.page : (cur.objects[idx - 1] ?? sel);
      } else sel.attrs[an] = av;
    }
  }
  return { pages };
}

/** RGB565 number to a CSS color. */
export function rgb565(v: number): string {
  const r = ((v >> 11) & 0x1f) * 255 / 31;
  const g = ((v >> 5) & 0x3f) * 255 / 63;
  const b = (v & 0x1f) * 255 / 31;
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
