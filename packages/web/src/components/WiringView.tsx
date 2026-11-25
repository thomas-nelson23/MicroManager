/**
 * The wiring picture: the board with its pins where they really are, every part beside it, and a wire
 * per connection. Clicking a pin opens it in the inspector, where a request to Claude can be started.
 * A board without pin data gets the same picture from the pins the wiring names (a connection map).
 */
import { useMemo, useState } from "react";
import type { Board, BoardPin } from "@micromanager/server/boards";
import { checkWiring, type Connection, type Issue, resolveWiring, sketchPins, type Wiring } from "@micromanager/server/wiring";
import { Icon } from "./Icon.tsx";

const PITCH = 22;
const PART_W = 176;
const ROW = 20;
const LANE = 7;
const PAD = 16;

const WIRE: Record<string, string> = {
  red: "#ff5a6e", black: "#7d8f99", yellow: "#ffd84a", blue: "#4aa3ff", green: "#3ddc84", white: "#eef6f8", orange: "#ff9d3c",
  brown: "#b98a62", purple: "#b58cff", violet: "#b58cff", grey: "#a9b8bf", gray: "#a9b8bf", pink: "#ff8ad1",
};
const wireColour = (c: Connection, kind: BoardPin["kind"] | undefined) => WIRE[c.color?.toLowerCase() ?? ""] ?? (kind === "gnd" ? WIRE.black! : kind === "power" ? WIRE.red! : "#58d6e6");

const QUICK = ["IR receiver", "Push button", "LED", "Servo", "DHT22 sensor", "Relay", "Potentiometer", "Buzzer"];
const CAP_WORDS: Record<string, string> = { digital: "digital", analog: "analog in", pwm: "PWM", interrupt: "interrupt", i2c: "I2C", spi: "SPI", serial: "serial" };

interface Props {
  board: Board | undefined;
  boardName: string;
  wiring: Wiring;
  wiringError?: string;
  /** True when the wiring was read from an older project's hardware.md table. */
  legacy: boolean;
  sketch: string;
  /** Put a request for Claude in the message box. */
  onAsk: (text: string) => void;
  onOpenSketchLine: (line: number) => void;
}

interface PartBox {
  name: string;
  side: "L" | "R";
  x: number;
  y: number;
  h: number;
  rows: { conn: number; label: string; y: number }[];
}

export function WiringView({ board: realBoard, boardName, wiring, wiringError, legacy, sketch, onAsk, onOpenSketchLine }: Props) {
  const [sel, setSel] = useState<number | null>(null);
  const [hover, setHover] = useState<{ pin?: number; part?: string; conn?: number } | null>(null);
  const [what, setWhat] = useState("");

  // A board we have no pins for: make a one-sided strip of the pins the wiring names.
  const board = useMemo<Board>(() => {
    if (realBoard) return realBoard;
    const names = [...new Set(wiring.connections.map((c) => c.pin.trim()))];
    return {
      id: "unknown", fqbn: "", name: boardName, flasher: "nano-every", volts: 5, fiveVoltTolerant: true, flashKb: 0, usb: [],
      pins: names.map((name) => ({ name, side: "R" as const, kind: /^gnd$/i.test(name) ? ("gnd" as const) : /^(5v|3v3|3\.3v|vin|vcc)$/i.test(name) ? ("power" as const) : ("io" as const), caps: [] })),
    };
  }, [realBoard, boardName, wiring]);

  const model = useMemo(() => layout(board, wiring), [board, wiring]);
  const issues = useMemo(() => checkWiring(board, wiring, realBoard ? sketch : undefined), [board, wiring, sketch, realBoard]);
  const used = useMemo(() => (realBoard ? sketchPins(sketch, board) : []), [realBoard, sketch, board]);
  const issuePins = useMemo(() => new Map(issues.filter((i) => i.pin && i.level !== "info").map((i) => [i.pin!, i.level])), [issues]);

  const lit = (connIndex: number) => {
    const h = hover ?? (sel !== null ? { pin: sel } : null);
    if (!h) return true;
    const w = model.wires[connIndex];
    if (!w) return false;
    return h.conn === connIndex || (h.pin !== undefined && w.pin === h.pin) || (h.part !== undefined && w.part === h.part);
  };

  const selPin = sel !== null ? board.pins[sel] : undefined;
  const selConns = sel !== null ? model.wires.filter((w) => w.pin === sel).map((w) => wiring.connections[w.conn]!) : [];
  const selUse = sel !== null ? used.find((u) => u.index === sel) : undefined;

  const ask = (text: string) => {
    onAsk(text);
    setWhat("");
  };

  return (
    <div className="wiring">
      <div className="wiring-canvas">
        {wiringError && <div className="msg bad"><span className="led" /><div className="body">{wiringError}</div></div>}
        <svg className="wiring-svg" viewBox={`0 0 ${model.width} ${model.height}`} style={{ width: `min(100%, ${Math.round(model.width * 1.7)}px, max(${Math.round(model.width * 0.85)}px, calc((100vh - 210px) * ${(model.width / model.height).toFixed(3)})))` }} role="group" aria-label={`Wiring of ${board.name}`}>
          {/* wires under everything */}
          <g fill="none" strokeLinejoin="round">
            {model.wires.map((w, i) => (
              <path
                key={i}
                d={w.d}
                stroke={wireColour(wiring.connections[w.conn]!, board.pins[w.pin]?.kind)}
                strokeWidth={lit(i) && (hover || sel !== null) ? 2.6 : 1.8}
                opacity={lit(i) ? 1 : 0.18}
                onMouseEnter={() => setHover({ conn: i })}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${board.pins[w.pin]!.name} to ${w.part}${wiring.connections[w.conn]!.partPin ? ` ${wiring.connections[w.conn]!.partPin}` : ""}`}</title>
              </path>
            ))}
          </g>

          {/* the board */}
          <rect x={model.bx} y={model.by} width={model.bw} height={model.bh} rx="6" className="w-board" />
          <rect x={model.bx + model.bw / 2 - 18} y={model.by - 6} width="36" height="16" rx="2" className="w-usb" />
          <text x={model.bx + model.bw / 2} y={model.by + model.bh - 10} textAnchor="middle" className="w-board-name">{board.name}</text>
          {!realBoard && <text x={model.bx + model.bw / 2} y={model.by + 26} textAnchor="middle" className="w-dim">connection map</text>}

          {model.pins.map((p, i) => {
            const pin = board.pins[i]!;
            const wired = model.wires.some((w) => w.pin === i);
            const inSketch = used.some((u) => u.index === i);
            const level = issuePins.get(pin.name);
            const free = pin.kind === "io" && !wired;
            const left = pin.side === "L";
            return (
              <g
                key={i}
                className={`w-pin ${pin.kind} ${wired ? "wired" : ""} ${free ? "free" : ""} ${sel === i ? "sel" : ""} ${level ?? ""}`}
                onClick={() => setSel(sel === i ? null : i)}
                onMouseEnter={() => setHover({ pin: i })}
                onMouseLeave={() => setHover(null)}
                tabIndex={0}
                role="button"
                aria-label={`Pin ${pin.name}${wired ? ", wired" : free ? ", free" : ""}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSel(sel === i ? null : i);
                  }
                }}
              >
                <rect x={left ? model.bx - 8 : model.bx + model.bw / 2} y={p.y - PITCH / 2} width={model.bw / 2 + 8} height={PITCH} fill="transparent" />
                <circle cx={p.x} cy={p.y} r="5" className="w-dot" />
                {inSketch && !wired && <circle cx={p.x} cy={p.y} r="8.5" className="w-ring" />}
                <text x={left ? p.x + 11 : p.x - 11} y={p.y + 4} textAnchor={left ? "start" : "end"} className="w-pin-name">{pin.name}</text>
                {pin.role && <text x={left ? p.x + 46 : p.x - 46} y={p.y + 3.5} textAnchor={left ? "start" : "end"} className="w-role">{pin.role.split(",")[0]}</text>}
                <title>{`${pin.name}${pin.role ? ` · ${pin.role}` : ""}${pin.caps.length ? ` · ${pin.caps.map((c) => CAP_WORDS[c]).join(", ")}` : ""}`}</title>
              </g>
            );
          })}

          {/* the parts */}
          {model.parts.map((part) => {
            const dim = hover?.part ? hover.part !== part.name : hover || sel !== null ? !part.rows.some((r) => lit(r.conn)) : false;
            return (
              <g key={part.name} className="w-part" opacity={dim ? 0.35 : 1} onMouseEnter={() => setHover({ part: part.name })} onMouseLeave={() => setHover(null)}>
                <rect x={part.x} y={part.y} width={PART_W} height={part.h} rx="4" className="w-part-box" />
                <text x={part.x + 12} y={part.y + 20} className="w-part-name">{part.name.length > 22 ? `${part.name.slice(0, 21)}…` : part.name}</text>
                {part.rows.map((r) => {
                  const edge = part.side === "L" ? part.x + PART_W : part.x;
                  const bad = model.wires[r.conn] === undefined;
                  return (
                    <g key={r.conn}>
                      <circle cx={edge} cy={r.y} r="3.5" className={`w-part-dot ${bad ? "bad" : ""}`} />
                      <text x={part.side === "L" ? edge - 9 : edge + 9} y={r.y + 4} textAnchor={part.side === "L" ? "end" : "start"} className={`w-part-pin ${bad ? "bad" : ""}`}>
                        {r.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        {wiring.connections.length === 0 && <p className="card-text dim">Nothing is wired yet. Click a pin, or tell Claude what you're connecting.</p>}
      </div>

      <aside className="wiring-side">
        <section className="panel">
          {selPin ? (
            <>
              <div className="panel-head">
                <h3 className="h4">Pin {selPin.name}</h3>
                <button className="btn quiet icon-only" type="button" aria-label="Close" onClick={() => setSel(null)}><Icon name="x" /></button>
              </div>
              <p className="card-text">
                {selPin.kind === "io" ? selPin.caps.map((c) => CAP_WORDS[c]).join(" · ") || "digital" : selPin.kind === "gnd" ? "Ground" : selPin.kind === "power" ? "Power" : "Not for wiring parts"}
                {selPin.role ? ` · ${selPin.role}` : ""}
                {selPin.kind === "io" && realBoard ? ` · ${board.volts} V logic` : ""}
              </p>
              {selConns.map((c, k) => (
                <div key={k} className="pin-conn">
                  <span><b>{c.part}</b>{c.partPin ? ` ${c.partPin}` : ""}{c.color ? ` · ${c.color} wire` : ""}</span>
                  {selPin.kind === "io" && (
                    <span className="actions">
                      <button className="btn quiet" type="button" onClick={() => ask(`Move the ${c.part}${c.partPin ? ` ${c.partPin}` : ""} from pin ${selPin.name} to pin `)}>Move…</button>
                      <button className="btn quiet" type="button" onClick={() => ask(`Remove the ${c.part} (pin ${selPin.name}) from the wiring and the sketch.`)}>Remove…</button>
                    </span>
                  )}
                </div>
              ))}
              {selUse && (
                <p className="card-text">
                  Used in the sketch as <code className="code">{selUse.as}</code>,{" "}
                  <button className="link-btn" type="button" onClick={() => onOpenSketchLine(selUse.line)}>line {selUse.line}</button>.
                </p>
              )}
              {selPin.kind === "io" && selConns.length === 0 && (
                <form
                  className="pin-add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (what.trim()) ask(`Add ${article(what.trim())} on ${pinPhrase(selPin.name)}.`);
                  }}
                >
                  <label htmlFor="pin-what" className="eyebrow">What goes on {selPin.name}?</label>
                  <div className="row">
                    <input id="pin-what" className="text-input" value={what} placeholder="IR receiver" onChange={(e) => setWhat(e.target.value)} autoFocus />
                    <button className="btn md primary" type="submit" disabled={!what.trim()}>Ask Claude</button>
                  </div>
                  <div className="quick">
                    {QUICK.map((q) => (
                      <button key={q} type="button" className="btn" onClick={() => ask(`Add ${article(q)} on ${pinPhrase(selPin.name)}.`)}>{q}</button>
                    ))}
                  </div>
                  <span className="help">This writes the request in the message box. Claude then updates the wiring and the sketch together.</span>
                </form>
              )}
            </>
          ) : (
            <>
              <div className="panel-head"><h3 className="h4">Wiring</h3></div>
              <p className="card-text">
                Click a free pin to add a part there, or a wired pin to see or change what's on it.
                {realBoard ? ` ${board.name} runs at ${board.volts} V${board.fiveVoltTolerant ? "" : " and its pins are not 5 V tolerant"}.` : " This board has no pin drawing yet, so only the pins in use are shown."}
              </p>
              <ul className="legend">
                <li><i className="lg-dot wired" />wired</li>
                <li><i className="lg-dot free" />free pin</li>
                <li><i className="lg-dot ring" />used in the sketch, not wired</li>
                <li><i className="lg-dot bad" />has a problem</li>
              </ul>
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3 className="h4">Checks</h3>
            <span className="note">{issues.filter((i) => i.level !== "info").length || "no"} problem{issues.filter((i) => i.level !== "info").length === 1 ? "" : "s"}</span>
          </div>
          {legacy && (
            <IssueRow issue={{ level: "info", text: "This wiring was read from the table in hardware.md. Ask Claude to move it into wiring.json to keep it reliable." }} onPick={() => ask("Move the wiring table from hardware.md into wiring.json.")} action="Ask" />
          )}
          {issues.length === 0 && !legacy && <p className="card-text dim">Nothing to flag.</p>}
          {issues.map((it, k) => (
            <IssueRow
              key={k}
              issue={it}
              onPick={() => {
                const idx = it.pin ? board.pins.findIndex((p) => p.name === it.pin) : -1;
                if (idx >= 0) setSel(idx);
              }}
            />
          ))}
        </section>
      </aside>
    </div>
  );
}

function IssueRow({ issue, onPick, action }: { issue: Issue; onPick: () => void; action?: string }) {
  return (
    <button type="button" className={`issue ${issue.level}`} onClick={onPick}>
      <span className="issue-mark">{issue.level === "info" ? "i" : "!"}</span>
      <span className="issue-text">{issue.text}</span>
      {action && <span className="issue-action">{action}</span>}
    </button>
  );
}

const article = (s: string) => (/^(a|an|the)\s/i.test(s) ? s : `${/^[aeiou]/i.test(s) || /^(IR|LED|LDR|RGB|RTC|SD|NTC)\b/.test(s) ? "an" : "a"} ${s}`);
const pinPhrase = (name: string) => (/^\d+$/.test(name) ? `pin ${name}` : name);

interface Wire {
  conn: number;
  pin: number;
  part: string;
  d: string;
}

function layout(board: Board, wiring: Wiring) {
  const resolved = resolveWiring(board, wiring);
  const left = board.pins.map((p, i) => ({ p, i })).filter((x) => x.p.side === "L");
  const right = board.pins.map((p, i) => ({ p, i })).filter((x) => x.p.side === "R");
  const rows = Math.max(left.length, right.length, 4);
  // wide enough that the role notes of both edges don't meet in the middle
  const roleLen = (list: typeof left) => Math.max(0, ...list.map((x) => (x.p.role ?? "").split(",")[0]!.length));
  const BOARD_W = Math.max(168, Math.round(104 + (roleLen(left) + roleLen(right)) * 5.6));
  const bh = rows * PITCH + 44;

  // Which side each part sits on: where most of its signal pins are.
  const partNames = [...new Set(wiring.connections.map((c) => c.part))];
  const sideOf = new Map<string, "L" | "R">();
  const count = { L: 0, R: 0 };
  for (const name of partNames) {
    let l = 0;
    let r = 0;
    resolved.forEach((x) => {
      if (x.conn.part !== name || !x.pins.length) return;
      const pin = board.pins[x.pins[0]!]!;
      const weight = pin.kind === "io" ? 3 : 0;
      if (x.pins.some((i) => board.pins[i]!.side === "L")) l += weight || (x.pins.every((i) => board.pins[i]!.side === "L") ? 1 : 0);
      if (x.pins.some((i) => board.pins[i]!.side === "R")) r += weight || (x.pins.every((i) => board.pins[i]!.side === "R") ? 1 : 0);
    });
    const side = l > r ? "L" : r > l ? "R" : left.length === 0 ? "R" : count.L <= count.R ? "L" : "R";
    sideOf.set(name, side);
    count[side]++;
  }

  // Pick the actual board pin for each connection (GND and power exist on both sides).
  const target = resolved.map((x) => {
    if (!x.pins.length) return -1;
    const side = sideOf.get(x.conn.part)!;
    return x.pins.find((i) => board.pins[i]!.side === side) ?? x.pins[0]!;
  });

  const laneCount = { L: 0, R: 0 };
  const cross: number[] = [];
  target.forEach((t, k) => {
    if (t < 0) return;
    const side = sideOf.get(wiring.connections[k]!.part)!;
    laneCount[side]++;
    if (board.pins[t]!.side !== side) {
      laneCount[board.pins[t]!.side]++;
      cross.push(k);
    }
  });

  const hasLeft = count.L > 0;
  const lanesL = 18 + laneCount.L * LANE;
  const lanesR = 18 + laneCount.R * LANE;
  const bx = PAD + (hasLeft ? PART_W + lanesL : cross.length ? lanesL : 12);
  const by = PAD + 10;
  const pinY = (order: number) => by + 30 + order * PITCH;
  const pins = board.pins.map((p, i) => {
    const order = (p.side === "L" ? left : right).findIndex((x) => x.i === i);
    return { x: p.side === "L" ? bx : bx + BOARD_W, y: pinY(order) };
  });

  // Stack the parts on each side, ordered by where their wires land.
  const parts: PartBox[] = [];
  const height = { L: by, R: by };
  for (const side of ["L", "R"] as const) {
    const mine = partNames
      .filter((n) => sideOf.get(n) === side)
      .map((name) => {
        const conns = wiring.connections.map((c, k) => ({ c, k })).filter((x) => x.c.part === name);
        const ys = conns.map((x) => (target[x.k]! >= 0 ? pins[target[x.k]!]!.y : Infinity)).filter(Number.isFinite);
        return { name, conns, mean: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : Infinity };
      })
      .sort((a, b) => a.mean - b.mean);
    let y = by;
    for (const m of mine) {
      const sorted = [...m.conns].sort((a, b) => (target[a.k]! >= 0 ? pins[target[a.k]!]!.y : 1e9) - (target[b.k]! >= 0 ? pins[target[b.k]!]!.y : 1e9));
      const h = 30 + sorted.length * ROW + 6;
      // pull the part towards the pins it uses, without overlapping the one above
      const want = Number.isFinite(m.mean) ? m.mean - h / 2 : y;
      const py = Math.max(y, Math.round(want));
      parts.push({
        name: m.name,
        side,
        x: side === "L" ? PAD : bx + BOARD_W + lanesR,
        y: py,
        h,
        rows: sorted.map((x, j) => ({ conn: x.k, label: x.c.partPin || x.c.pin, y: py + 38 + j * ROW })),
      });
      y = py + h + 14;
    }
    height[side] = y;
  }

  // Route: out of the part, along a lane of its own, into the pin. Wires to the far side go under the board.
  const wires: Wire[] = [];
  const lane = { L: 0, R: 0 };
  let under = 0;
  const laneX = (side: "L" | "R") => {
    const n = lane[side]++;
    return side === "L" ? bx - 12 - n * LANE : bx + BOARD_W + 12 + n * LANE;
  };
  const rowsByConn = new Map<number, { x: number; y: number; side: "L" | "R" }>();
  for (const p of parts) for (const r of p.rows) rowsByConn.set(r.conn, { x: p.side === "L" ? p.x + PART_W : p.x, y: r.y, side: p.side });
  const order = [...rowsByConn.keys()].sort((a, b) => rowsByConn.get(a)!.y - rowsByConn.get(b)!.y);
  for (const k of order) {
    const t = target[k]!;
    if (t < 0) continue;
    const from = rowsByConn.get(k)!;
    const to = pins[t]!;
    const pinSide = board.pins[t]!.side;
    let d: string;
    if (pinSide === from.side) {
      const lx = laneX(from.side);
      d = `M${from.x} ${from.y}H${lx}V${to.y}H${to.x}`;
    } else {
      const lx = laneX(from.side);
      const fx = laneX(pinSide);
      const uy = by + bh + 12 + under++ * LANE;
      d = `M${from.x} ${from.y}H${lx}V${uy}H${fx}V${to.y}H${to.x}`;
    }
    wires[k] = { conn: k, pin: t, part: wiring.connections[k]!.part, d };
  }
  // keep indexes aligned with connections; unresolved ones are simply absent
  const dense = wiring.connections.map((_, k) => wires[k]).filter((w): w is Wire => !!w);
  const wireIndex = new Map(dense.map((w, i) => [w.conn, i]));
  for (const p of parts) for (const r of p.rows) r.conn = wireIndex.get(r.conn) ?? -1 - r.conn;

  const width = bx + BOARD_W + (count.R > 0 ? lanesR + PART_W : cross.length ? lanesR : 12) + PAD;
  const total = Math.max(by + bh + 12 + under * LANE, height.L, height.R) + PAD;
  return { width, height: total, bx, by, bh, bw: BOARD_W, pins, parts, wires: dense };
}
