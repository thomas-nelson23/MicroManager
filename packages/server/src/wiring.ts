/**
 * A project's wiring as data (wiring.json), and the checks the page runs on it. Pure functions,
 * shared with the web UI.
 */
import { type Board, type BoardPin, findPins, type PinCap, pinToken } from "./boards.ts";

export interface Connection {
  /** Board pin, as printed on the board ("D4", "TX1", "5V"). */
  pin: string;
  /** What it goes to ("IR receiver"). */
  part: string;
  /** The pin on that part ("OUT"). */
  partPin?: string;
  /** Wire colour, a plain colour word. */
  color?: string;
  /** Voltage of a signal the part drives into the board pin ("5V" or "3.3V"). */
  signal?: string;
  note?: string;
}

export interface Wiring {
  connections: Connection[];
}

export interface Issue {
  level: "error" | "warn" | "info";
  text: string;
  /** Board pin name the issue is about, if any. */
  pin?: string;
  part?: string;
}

const COLOURS = ["red", "black", "yellow", "blue", "green", "white", "orange", "brown", "purple", "violet", "grey", "gray", "pink"];
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** Parse wiring.json. Bad entries are dropped; a file that isn't JSON gives an error. */
export function parseWiring(text: string): { wiring: Wiring; error?: string } {
  if (!text.trim()) return { wiring: { connections: [] } };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { wiring: { connections: [] }, error: `wiring.json is not valid JSON: ${(e as Error).message}` };
  }
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { connections?: unknown })?.connections) ? (raw as { connections: unknown[] }).connections : null;
  if (!list) return { wiring: { connections: [] }, error: 'wiring.json must be {"connections": [...]}' };
  const connections: Connection[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const pin = str(o.pin);
    const part = str(o.part);
    if (!pin || !part) continue;
    const c: Connection = { pin, part };
    for (const k of ["partPin", "color", "signal", "note"] as const) {
      const v = str(o[k]);
      if (v) c[k] = v;
    }
    connections.push(c);
  }
  return { wiring: { connections } };
}

/** wiring.json text, one connection per line. */
export function formatWiring(w: Wiring): string {
  const line = (c: Connection) => `    {${Object.entries(c).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")}}`;
  return w.connections.length ? `{\n  "connections": [\n${w.connections.map(line).join(",\n")}\n  ]\n}\n` : '{"connections": []}\n';
}

/** The wiring as a few words per wire, for a tool reply: "D4 IR receiver OUT". */
export const wiringLines = (w: Wiring) => w.connections.map((c) => [c.pin, c.part, c.partPin].filter(Boolean).join(" ")).join("; ") || "no wires";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Change a wiring: drop every wire of the parts (or on the board pins) named in `remove`, then add
 * the wires in `set`. A wire in `set` replaces that part's wire with the same part pin.
 */
export function applyWiring(w: Wiring, change: { set?: Connection[]; remove?: string[] }): Wiring {
  let connections = w.connections.filter((c) => !(change.remove ?? []).some((r) => same(r, c.part) || pinToken(r) === pinToken(c.pin)));
  for (const n of change.set ?? []) {
    connections = connections.filter((c) => !(same(c.part, n.part) && same(c.partPin ?? "", n.partPin ?? "")));
    connections.push(n);
  }
  return { connections };
}

/** Rename a wiring's pins for another board (D4 -> 4, A0 -> 14, 5V -> VIN). Pins the new board lacks are kept, and the checks flag them. */
export function remapWiring(w: Wiring, from: Board, to: Board): Wiring {
  return {
    connections: w.connections.map((c) => {
      const old = from.pins[findPins(from, c.pin)[0] ?? -1];
      const names = old ? [old.name, ...(old.aliases ?? [])] : [c.pin];
      // a 5 V supply pin stays a 5 V supply pin, whatever it is called
      if (old?.kind === "power" && names.some((n) => /^5V$/i.test(n))) names.unshift("5V");
      // a serial port's pin stays on that port (pin numbers differ: D1 is Serial1 TX on a Nano, USB TX on an ESP32)
      const port = /^Serial\d (TX|RX)/.exec(old?.role ?? "")?.[0];
      const same = port ? to.pins.find((p) => p.role?.startsWith(port)) : undefined;
      if (same) return { ...c, pin: same.name };
      for (const n of names) {
        const hit = to.pins[findPins(to, n)[0] ?? -1];
        if (hit && (!old || hit.kind === old.kind)) return { ...c, pin: hit.name };
      }
      return c;
    }),
  };
}

/** hardware.md without its "| Pin | Goes to |" table (the wiring now lives in wiring.json). */
export function stripHardwareTable(md: string): string {
  const out: string[] = [];
  let dropped = false;
  for (const l of md.split("\n")) {
    if (/^\s*\|/.test(l)) {
      if (!dropped) out.push("The connections are in wiring.json.");
      dropped = true;
    } else out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Read the "| Pin | Goes to |" table of an older project's hardware.md as wiring. */
export function wiringFromHardwareMd(md: string): Wiring {
  const rows = md
    .split("\n")
    .filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const connections: Connection[] = [];
  for (const [pin, goes] of rows.slice(1)) {
    if (!pin || !goes) continue;
    let rest = goes;
    let color: string | undefined;
    const paren = /\(([^)]+)\)\s*$/.exec(rest);
    if (paren && COLOURS.includes(paren[1]!.toLowerCase())) {
      color = paren[1]!.toLowerCase();
      rest = rest.slice(0, paren.index).trim();
    }
    const words = rest.split(/\s+/);
    const c: Connection = words.length > 1 ? { pin, part: words.slice(0, -1).join(" "), partPin: words.at(-1)! } : { pin, part: rest };
    if (color) c.color = color;
    connections.push(c);
  }
  return { connections };
}

export interface SketchPin {
  /** Index into board.pins. */
  index: number;
  /** 1-based line of the first use. */
  line: number;
  /** The text that named it ("IR_PIN", "4"). */
  as: string;
}

const PIN_CALLS = "pinMode|digitalWrite|digitalRead|digitalWriteFast|digitalReadFast|analogRead|analogWrite|attachInterrupt|digitalPinToInterrupt|tone|noTone|pulseIn|shiftOut|shiftIn";

/** The board pins a sketch uses, found from pin calls and from constants named like pins. Best effort. */
export function sketchPins(src: string, board: Board): SketchPin[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const lines = code.split("\n").map((l) => l.replace(/\/\/.*$/, ""));
  const consts = new Map<string, { value: string; line: number }>();
  lines.forEach((l, i) => {
    const m =
      /^\s*#\s*define\s+([A-Za-z_]\w*)\s+\(?\s*([A-Za-z_]\w*|\d+)\s*\)?\s*$/.exec(l) ??
      /^\s*(?:static\s+)?(?:const|constexpr)\s+(?:unsigned\s+)?[A-Za-z_]\w*\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*|\d+)\s*;/.exec(l);
    if (m) consts.set(m[1]!, { value: m[2]!, line: i + 1 });
  });
  const resolve = (tok: string, depth = 0): number[] => {
    const hit = findPins(board, tok).filter((i) => board.pins[i]!.kind === "io");
    if (hit.length || depth > 4) return hit;
    const c = consts.get(tok);
    return c ? resolve(c.value, depth + 1) : [];
  };
  const found = new Map<number, SketchPin>();
  const add = (tok: string, line: number) => {
    for (const index of resolve(tok).slice(0, 1)) if (!found.has(index)) found.set(index, { index, line, as: tok });
  };
  const call = new RegExp(`\\b(?:${PIN_CALLS})\\s*\\(\\s*([A-Za-z_]\\w*|\\d+)`, "g");
  const attach = /\.\s*(?:attach|begin)\s*\(\s*([A-Za-z_]\w*)\s*[,)]/g;
  lines.forEach((l, i) => {
    for (const m of l.matchAll(call)) if (m[1] !== "digitalPinToInterrupt") add(m[1]!, i + 1);
    for (const m of l.matchAll(attach)) if (consts.has(m[1]!)) add(m[1]!, i + 1);
  });
  for (const [name, c] of consts) if (/pin/i.test(name)) add(name, c.line);
  return [...found.values()].sort((a, b) => a.line - b.line);
}

const NEEDS: { re: RegExp; cap: PinCap; what: string }[] = [
  { re: /\bservo\b|\bbuzzer\b|\bpiezo\b|\bdimm/i, cap: "pwm", what: "PWM" },
  { re: /\bpot(entiometer)?\b|\bldr\b|photoresistor|thermistor|\banalog\b/i, cap: "analog", what: "an analog input" },
];

export interface Resolved {
  conn: Connection;
  /** Indexes of matching board pins (several for GND); empty when the board has no such pin. */
  pins: number[];
}

export const resolveWiring = (board: Board, wiring: Wiring): Resolved[] => wiring.connections.map((conn) => ({ conn, pins: findPins(board, conn.pin) }));

const isDisplay = (part: string) => /display|nextion|screen/i.test(part);

/** Everything worth telling the person about this wiring on this board. */
export function checkWiring(board: Board, wiring: Wiring, sketch?: string): Issue[] {
  const issues: Issue[] = [];
  const resolved = resolveWiring(board, wiring);
  const byPin = new Map<number, Connection[]>();
  for (const r of resolved) {
    if (!r.pins.length) {
      issues.push({ level: "error", pin: r.conn.pin, part: r.conn.part, text: `${board.name} has no pin called ${r.conn.pin} (${r.conn.part}${r.conn.partPin ? ` ${r.conn.partPin}` : ""}).` });
      continue;
    }
    const pin: BoardPin = board.pins[r.pins[0]!]!;
    if (pin.kind !== "io") continue;
    byPin.set(r.pins[0]!, [...(byPin.get(r.pins[0]!) ?? []), r.conn]);
    const five = /^5/.test(r.conn.signal ?? "");
    if (five && !board.fiveVoltTolerant) {
      issues.push({ level: "error", pin: pin.name, part: r.conn.part, text: `${r.conn.part} drives 5 V into pin ${pin.name}, but ${board.name} pins are ${board.volts} V and not 5 V tolerant. Use a level shifter or a divider.` });
    }
    const label = `${r.conn.part} ${r.conn.partPin ?? ""}`;
    for (const n of NEEDS) {
      if (n.re.test(label) && !/vcc|gnd|power/i.test(r.conn.partPin ?? "") && !pin.caps.includes(n.cap)) {
        issues.push({ level: "warn", pin: pin.name, part: r.conn.part, text: `${r.conn.part} usually needs ${n.what}, and pin ${pin.name} doesn't have it.` });
      }
    }
    const i2c = /^(sda|scl)$/i.exec(r.conn.partPin ?? "");
    if (i2c && !new RegExp(i2c[1]!, "i").test(pin.role ?? "")) {
      issues.push({ level: "warn", pin: pin.name, part: r.conn.part, text: `${r.conn.part} ${i2c[1]!.toUpperCase()} is on pin ${pin.name}, which is not an ${i2c[1]!.toUpperCase()} pin on ${board.name}.` });
    }
  }
  for (const [index, conns] of byPin) {
    const parts = [...new Set(conns.map((c) => c.part))];
    if (parts.length > 1) issues.push({ level: "error", pin: board.pins[index]!.name, text: `Pin ${board.pins[index]!.name} has ${parts.length} parts on it: ${parts.join(" and ")}.` });
  }
  if (sketch !== undefined) {
    const used = sketchPins(sketch, board);
    const usedIdx = new Set(used.map((u) => u.index));
    for (const u of used) {
      if (!byPin.has(u.index)) issues.push({ level: "warn", pin: board.pins[u.index]!.name, text: `The sketch uses pin ${board.pins[u.index]!.name} (line ${u.line}), but the wiring doesn't list it.` });
    }
    for (const [index, conns] of byPin) {
      if (usedIdx.has(index) || conns.every((c) => isDisplay(c.part))) continue;
      issues.push({ level: "info", pin: board.pins[index]!.name, part: conns[0]!.part, text: `${conns[0]!.part} is wired to pin ${board.pins[index]!.name}, but the sketch doesn't seem to use that pin yet.` });
    }
  }
  const order = { error: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}
