/**
 * Compact hmi.txt elements, expanded to Nextion Editor automation commands.
 *
 * A compact element describes one page or one component on a single line:
 *
 *   {"page": "main", "bco": 0, "on": {"loadend": "tm0.en=1"}}
 *   {"obj": "text", "name": "t0", "x": 20, "y": 20, "w": 200, "h": 40, "txt_maxl": 40, "txt": "Hi"}
 *   {"obj": "button", "name": "b0", "x": 20, "y": 80, "w": 120, "h": 50, "txt": "Go", "on": {"down": ["prints \"go\",0", "t0.txt=\"go\""]}}
 *
 * "obj" is a type name from TYPE_ALIASES, a components.json key, or an objtype number. Every other key
 * is an attribute (numbers are fine). "on" maps event names to code, as a string or an array of lines.
 * txt_maxl is always set before txt. Old-style {"com": ...} commands may be mixed in and pass through.
 * nextion/nxprep.py implements the same expansion for the build; keep the two in step.
 */
import components from "../nextion/components.json" with { type: "json" };

export const TYPE_ALIASES: Record<string, number> = {
  page: 121, text: 116, button: 98, dsbutton: 53, number: 54, float: 59, progress: 106, slider: 1,
  gauge: 122, waveform: 0, picture: 112, crop: 113, hotspot: 109, checkbox: 56, radio: 57, switch: 67,
  qrcode: 58, scrolltext: 62, timer: 51, variable: 52,
};

const RESERVED = new Set(["page", "obj", "name", "on"]);

export type HmiCommand = Record<string, string>;
export interface ExpandedCommand {
  cmd: HmiCommand;
  /** 1-based position of the element in hmi.txt this command came from. */
  source: number;
}

export function resolveType(t: unknown): number | undefined {
  if (typeof t === "number" && Number.isInteger(t)) return t;
  const s = String(t ?? "").trim();
  if (/^\d+$/.test(s)) return Number(s);
  if (s.toLowerCase() in TYPE_ALIASES) return TYPE_ALIASES[s.toLowerCase()];
  const def = (components as Record<string, { id: string }>)[s];
  return def && /^\d+$/.test(def.id) ? Number(def.id) : undefined;
}

function eventCode(v: unknown): string {
  return Array.isArray(v) ? v.map(String).join("\r\n") : String(v ?? "").replace(/\r?\n/g, "\r\n");
}

/** Expand elements 1..n of hmi.txt (element 0, the settings, is not included). Throws on a bad compact element. */
export function expandHmi(elements: unknown[]): ExpandedCommand[] {
  const out: ExpandedCommand[] = [];
  elements.forEach((raw, i) => {
    const source = i + 2;
    const push = (cmd: HmiCommand) => out.push({ cmd, source });
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`element ${source}: expected an object`);
    const e = raw as Record<string, unknown>;
    if ("com" in e) {
      push(Object.fromEntries(Object.entries(e).map(([k, v]) => [k, String(v)])));
      return;
    }
    if ("page" in e) push({ com: "addpage", pagename: String(e.page) });
    else if ("obj" in e) {
      const t = resolveType(e.obj);
      if (t === undefined) throw new Error(`element ${source}: unknown obj type ${JSON.stringify(e.obj)}`);
      if (!e.name) throw new Error(`element ${source}: "obj" needs a "name"`);
      push({ com: "addobj", objtype: String(t), objname: String(e.name) });
    } else throw new Error(`element ${source}: needs "page", "obj" or "com"`);
    const atts = Object.keys(e).filter((k) => !RESERVED.has(k));
    atts.sort((a, b) => (a === "txt_maxl" ? -1 : b === "txt_maxl" ? 1 : 0));
    for (const k of atts) {
      const v = e[k];
      if (v !== null && typeof v === "object") throw new Error(`element ${source}: attribute ${k} must be a string or number`);
      push({ com: "setatt", attname: k, attval: String(v) });
    }
    if (e.on !== undefined) {
      if (!e.on || typeof e.on !== "object" || Array.isArray(e.on)) throw new Error(`element ${source}: "on" must map event names to code`);
      for (const [ev, code] of Object.entries(e.on as Record<string, unknown>)) push({ com: "setevent", eventname: ev, eventcode: eventCode(code) });
    }
  });
  return out;
}
