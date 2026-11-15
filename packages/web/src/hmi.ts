/** Parse nextion/hmi.txt (Nextion Editor automation JSON) into pages and components for the preview. */
import components from "@nextion-arduino/server/components.json";

type CompDef = { id: string; atts: Record<string, { default?: string }> };
const defs = components as unknown as Record<string, CompDef>;
const byId = new Map<number, { name: string; def: CompDef }>();
for (const [name, def] of Object.entries(defs)) if (/^\d+$/.test(def.id)) byId.set(Number(def.id), { name, def });

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

export function parseHmi(text: string): { pages: HmiPage[]; error?: string } {
  let cmds: unknown;
  try {
    cmds = JSON.parse(text);
  } catch (e) {
    return { pages: [], error: `hmi.txt is not valid JSON: ${(e as Error).message}` };
  }
  if (!Array.isArray(cmds)) return { pages: [], error: "hmi.txt must be a JSON array" };
  const pages: HmiPage[] = [];
  let cur: HmiPage | null = null;
  let sel: HmiObject | null = null;
  for (const raw of cmds.slice(1)) {
    const c = raw as Record<string, unknown>;
    const com = String(c.com ?? "");
    if (com === "addpage") {
      const page = makeObj(121, String(c.pagename ?? `page${pages.length}`));
      cur = { name: page.name, page, objects: [] };
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
