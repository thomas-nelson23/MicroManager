/**
 * The screen card's interactive mode: pick a component on the preview, move and resize it, change its
 * attributes in an inspector, and (with "Show on device") see colors, text, fonts and values change on
 * the real panel as you go. Edits stay a draft until saved into hmi.txt.
 */
import { type KeyboardEvent, type ReactNode, type Ref, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ProjectDetail } from "../api.ts";
import { useDevice } from "../device.tsx";
import { type AttrDef, attrDefs, type HmiObject, type HmiPage, isRuntimeAttr, parseHmi, rgb565Hex, toRgb565, withAttrs } from "../hmi.ts";
import { Icon } from "./Icon.tsx";
import { type Geometry, NexPreview } from "./NexPreview.tsx";
import "./screen-tools.css";

type Draft = Record<string, Record<string, string>>; // "page\0name" (name "" = the page) -> attrs
const key = (page: string, name: string) => `${page}\0${name}`;
const GEOMETRY = ["x", "y", "w", "h"];

/** Readable choices for the common select attributes (components.md has the editor's Chinese text). */
const CHOICES: Record<string, string[]> = {
  xcen: ["left", "center", "right"],
  ycen: ["top", "center", "bottom"],
  sta: ["crop image", "solid color", "image", "transparent"],
  style: ["flat", "border", "3D down", "3D up"],
  isbr: ["off", "on"],
  pw: ["off", "on"],
  en: ["off", "on"],
  dez: ["horizontal", "vertical"],
  vscope: ["local", "global"],
};
const LABELS: Record<string, string> = {
  txt: "text", txt_maxl: "max length", font: "font", pco: "text color", bco: "background", pco2: "pressed text",
  bco2: "pressed bg", borderc: "border color", borderw: "border width", xcen: "align x", ycen: "align y",
  sta: "fill", style: "style", isbr: "word wrap", val: "value", minval: "min", maxval: "max", spax: "spacing x",
  spay: "spacing y", tim: "period ms", en: "enabled", pic: "picture", picc: "crop picture", dez: "direction",
};

/** Instruction that sets one attribute on the running display. */
function setInstruction(target: string, att: string, value: string): string {
  if (att === "txt") return `${target}.txt="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\r")}"`;
  return `${target}.${att}=${Number(value) || 0}`;
}

export function ScreenWorkbench({ detail, width, pageIdx, setPageIdx, modeSwitch, onInsert, onShipScreen, stageRef }: {
  detail: ProjectDetail;
  /** Preview width in CSS px. */
  width: number;
  pageIdx: number;
  setPageIdx: (i: number) => void;
  /** The View/Edit switch, shown in the bar. */
  modeSwitch: ReactNode;
  /** Put a component's name in the chat message box. */
  onInsert: (name: string) => void;
  /** Build the screen in the container and flash it (no Claude turn). Resolves to a message for the person. */
  onShipScreen: () => Promise<{ ok: boolean; text: string }>;
  stageRef: Ref<HTMLDivElement>;
}) {
  const device = useDevice();
  const hmi = useMemo(() => parseHmi(detail.hmi), [detail.hmi]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [onDevice, setOnDevice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const d = detail.meta.display;
  const page: HmiPage | undefined = hmi.pages[Math.min(pageIdx, hmi.pages.length - 1)];

  // The page as it looks with the draft applied.
  const shown = useMemo<HmiPage | undefined>(() => {
    if (!page) return undefined;
    const pd = draft[key(page.name, "")];
    return {
      ...page,
      page: pd ? withAttrs(page.page, pd) : page.page,
      objects: page.objects.map((o) => (draft[key(page.name, o.name)] ? withAttrs(o, draft[key(page.name, o.name)]!) : o)),
    };
  }, [page, draft]);
  const obj: HmiObject | undefined = selected === "" ? shown?.page : shown?.objects.find((o) => o.name === selected);

  // ---- pushing runtime changes to the panel ----
  const queued = useRef<Map<string, string>>(new Map());
  const inflight = useRef(false);
  const flush = useCallback(async () => {
    if (inflight.current || !queued.current.size) return;
    inflight.current = true;
    const cmds = [...queued.current.values()];
    queued.current.clear();
    try {
      await device.run(cmds);
    } catch (e) {
      setMsg({ ok: false, text: `Couldn't reach the display: ${(e as Error).message}` });
      setOnDevice(false);
    } finally {
      inflight.current = false;
      if (queued.current.size) void flush();
    }
  }, [device]);
  const push = useCallback(
    (cmds: [string, string][]) => {
      for (const [k, c] of cmds) {
        queued.current.delete(k); // keep order: latest value last
        queued.current.set(k, c);
      }
      void flush();
    },
    [flush],
  );

  /** Show the current page on the panel with every runtime draft value applied. */
  const syncPage = useCallback(() => {
    if (!page) return;
    const cmds: [string, string][] = [["page", `page ${page.name}`]];
    for (const [k, attrs] of Object.entries(draft)) {
      const [p, name] = k.split("\0");
      if (p !== page.name) continue;
      const o = name ? page.objects.find((x) => x.name === name) : page.page;
      if (!o) continue;
      for (const [att, v] of Object.entries(attrs)) if (isRuntimeAttr(o.type, att)) cmds.push([`${name || p}.${att}`, setInstruction(name || p!, att, v)]);
    }
    push(cmds);
  }, [page, draft, push]);

  const toggleDevice = () => {
    if (onDevice) {
      setOnDevice(false);
      return;
    }
    if (!device.portLabel) {
      setMsg({ ok: false, text: "Choose the board's port first (top right)." });
      return;
    }
    setMsg(null);
    setOnDevice(true);
    if (!device.live) device.setLive(true);
  };
  // when switching it on or changing page
  const syncKey = onDevice && page ? page.name : null;
  useEffect(() => {
    if (syncKey) syncPage();
    // syncPage changes with every draft edit; only re-sync on page or mode change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  // ---- editing ----
  const change = useCallback(
    (name: string, attrs: Record<string, string>) => {
      if (!page) return;
      setMsg(null);
      setDraft((dr) => ({ ...dr, [key(page.name, name)]: { ...dr[key(page.name, name)], ...attrs } }));
      if (!onDevice) return;
      const o = name ? page.objects.find((x) => x.name === name) : page.page;
      if (!o) return;
      const target = name || page.name;
      push(Object.entries(attrs).filter(([att]) => isRuntimeAttr(o.type, att)).map(([att, v]) => [`${target}.${att}`, setInstruction(target, att, v)]));
    },
    [page, onDevice, push],
  );
  const onGeometry = useCallback((name: string, g: Geometry) => change(name, { x: String(g.x), y: String(g.y), w: String(g.w), h: String(g.h) }), [change]);

  const nudge = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!obj || !selected || !/^Arrow/.test(e.key)) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (e.altKey) change(selected, { w: String(Math.max(4, obj.num("w") + dx)), h: String(Math.max(4, obj.num("h") + dy)) });
    else change(selected, { x: String(Math.max(0, obj.num("x") + dx)), y: String(Math.max(0, obj.num("y") + dy)) });
  };

  const draftCount = Object.values(draft).reduce((n, a) => n + Object.keys(a).length, 0);
  const needsBuild = Object.entries(draft).some(([k, attrs]) => {
    const [p, name] = k.split("\0");
    const pg = hmi.pages.find((x) => x.name === p);
    const o = name ? pg?.objects.find((x) => x.name === name) : pg?.page;
    return o && Object.keys(attrs).some((a) => !isRuntimeAttr(o.type, a));
  });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      for (const [k, attrs] of Object.entries(draft)) {
        const [p, name] = k.split("\0");
        await api.setScreenAttrs(detail.meta.id, { page: p!, name: name || undefined, attrs });
      }
      setDraft({});
      setMsg({ ok: true, text: "Saved to the screen file. The display shows it for good after the next screen build and flash." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };
  const discard = () => {
    setDraft({});
    setMsg(null);
    if (onDevice && page) push([["page", `page ${page.name}`]]); // reloads the page as flashed
  };

  const bar = (
    <div className="screen-bar">
      {hmi.pages.length > 1 ? (
        <div className="seg md" role="group" aria-label="Page">
          {hmi.pages.map((p, i) => (
            <button key={p.name + i} type="button" className={i === pageIdx ? "checked" : ""} aria-pressed={i === pageIdx} onClick={() => { setPageIdx(i); setSelected(null); }}>
              {p.name}
            </button>
          ))}
        </div>
      ) : (
        <span className="eyebrow">Page {page?.name ?? ""}</span>
      )}
      <span className="workbench-tools">
        <button type="button" className={`btn md ${onDevice ? "checked" : ""}`} aria-pressed={onDevice} onClick={toggleDevice} title="Send color, text, font and value changes to the real display as you make them">
          <Icon name="zap" />
          {onDevice ? "Live on device" : "Show on device"}
        </button>
        {modeSwitch}
      </span>
    </div>
  );

  if (hmi.error || !page || !shown) {
    return (
      <div className="screen-view">
        <div className="screen-main">
          {bar}
          {hmi.error ? <div className="msg bad"><span className="led" /><div className="body">{hmi.error}</div></div> : <p className="card-text dim">No pages yet.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="screen-view workbench">
      <div className="screen-main">
        {bar}
        <div ref={stageRef} className="screen-stage workbench-preview" tabIndex={0} onKeyDown={nudge} aria-label="Screen preview. Click a component to select it; drag to move, drag the corner to resize; arrow keys move it (Shift for 10 px, Alt to resize).">
          {width > 0 && (
            <NexPreview page={shown} width={d.width} height={d.height} fonts={detail.fonts} displayWidth={width} selected={selected} onSelect={(n) => setSelected(n)} onGeometry={onGeometry} />
          )}
        </div>
        <div className="workbench-foot">
          {draftCount > 0 ? (
            <>
              <span className="note">{draftCount} unsaved change{draftCount === 1 ? "" : "s"}{needsBuild ? " · position, size or similar need a screen build to show on the device" : ""}</span>
              <span className="spacer" />
              <button type="button" className="btn md" onClick={discard} disabled={saving}>Discard</button>
              <button type="button" className="btn md primary" onClick={save} disabled={saving}>
                <Icon name="check" />
                {saving ? "Saving…" : "Save to screen"}
              </button>
            </>
          ) : (
            <>
              <span className="note">{onDevice ? "Changes to ● attributes show on the display as you make them." : "Drag to move, drag the corner to resize, or edit attributes on the right."}</span>
              <span className="spacer" />
              {msg?.ok && (
                <button
                  type="button"
                  className="btn md"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    setMsg({ ok: true, text: "Building the screen…" });
                    try {
                      setMsg(await onShipScreen());
                    } catch (e) {
                      setMsg({ ok: false, text: (e as Error).message });
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Build and flash screen
                </button>
              )}
            </>
          )}
        </div>
        {msg && <div className={`msg ${msg.ok ? "ok" : "bad"}`} role="status"><span className="led" /><div className="body">{msg.text}</div></div>}
      </div>
      <aside className="screen-side panel">
        {obj && selected !== null ? (
          <Inspector
            key={`${page.name}/${selected}`}
            obj={obj}
            isPage={selected === ""}
            fonts={detail.fonts}
            draft={draft[key(page.name, selected)] ?? {}}
            onDevice={onDevice}
            onChange={(attrs) => change(selected, attrs)}
            onClose={() => setSelected(null)}
            onAsk={selected === "" ? undefined : () => onInsert(obj.name)}
          />
        ) : (
          <>
            <div className="panel-head">
              <h3 className="h4">Components</h3>
              <button type="button" className="btn" onClick={() => setSelected("")}>Page settings</button>
            </div>
            <table className="table dense">
              <thead><tr><th>Name</th><th>Type</th></tr></thead>
              <tbody>
                {shown.objects.map((o, i) => (
                  <tr key={`${o.name}-${i}`} className={`pick ${draft[key(page.name, o.name)] ? "selected" : ""}`} onClick={() => setSelected(o.name)}>
                    <td className="mono">{o.name}</td>
                    <td className="dim">{o.typeName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span className="help">Select a component to edit it.</span>
          </>
        )}
      </aside>
    </div>
  );
}

function Inspector({ obj, isPage, fonts, draft, onDevice, onChange, onAsk, onClose }: {
  obj: HmiObject;
  isPage: boolean;
  fonts: { index: number; height: number }[];
  draft: Record<string, string>;
  onDevice: boolean;
  onChange: (attrs: Record<string, string>) => void;
  onAsk?: () => void;
  onClose: () => void;
}) {
  const defs = attrDefs(obj.type);
  // Attributes that only apply in some modes say so at the end of their description ("~sta=1").
  const applies = (def: AttrDef) => {
    const m = /~(\w+)=(\d+)$/.exec(def.desc ?? "");
    return !m || obj.get(m[1]!) === m[2];
  };
  const names = Object.entries(defs)
    .filter(([, def]) => (def as AttrDef & { visible?: boolean }).visible !== false && applies(def))
    .map(([n]) => n);
  return (
    <div className="inspector" aria-label={`Attributes of ${obj.name}`}>
      <div className="inspector-head">
        <h3 className="h4 mono">{isPage ? `page ${obj.name}` : obj.name}</h3>
        <span className="note">{obj.typeName}</span>
        <span className="spacer" />
        {onAsk && (
          <button type="button" className="btn" onClick={onAsk} title="Put this component's name in the message box">To chat</button>
        )}
        <button type="button" className="btn" onClick={onClose} aria-label="Back to the component list"><Icon name="x" /></button>
      </div>
      {!isPage && (
        <div className="inspector-geo">
          {GEOMETRY.map((n) => (
            <label key={n} className={n in draft ? "changed" : ""}>
              <span>{n}</span>
              <input type="number" value={obj.num(n)} min={n === "w" || n === "h" ? 1 : 0} onChange={(e) => onChange({ [n]: e.target.value })} aria-label={n} />
            </label>
          ))}
        </div>
      )}
      <div className="inspector-rows">
        {names.map((n) => (
          <Row key={n} name={n} def={defs[n]} obj={obj} fonts={fonts} changed={n in draft} live={onDevice && isRuntimeAttr(obj.type, n)} runtime={isRuntimeAttr(obj.type, n)} onChange={(v) => onChange({ [n]: v })} />
        ))}
      </div>
      <p className="inspector-legend note"><span className="rtmark rt" /> shows on the device right away · <span className="rtmark" /> needs a screen build (position and size always do)</p>
    </div>
  );
}

function Row({ name, def, obj, fonts, changed, live, runtime, onChange }: {
  name: string;
  def?: AttrDef;
  obj: HmiObject;
  fonts: { index: number; height: number }[];
  changed: boolean;
  live: boolean;
  runtime: boolean;
  onChange: (v: string) => void;
}) {
  const value = obj.get(name) ?? (GEOMETRY.includes(name) ? String(obj.num(name)) : "");
  const id = `att-${obj.name}-${name}`;
  let input;
  if (def?.type === "Color") {
    const n = Number(value) || 0;
    input = (
      <span className="inspector-color">
        <input type="color" value={rgb565Hex(n)} onChange={(e) => onChange(String(toRgb565(e.target.value)))} aria-label={`${name} color`} />
        <input id={id} className="inspector-num" type="number" min={0} max={65535} value={n} onChange={(e) => onChange(e.target.value)} />
      </span>
    );
  } else if (def?.type === "Fontid" && fonts.length) {
    input = (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {fonts.map((f) => <option key={f.index} value={f.index}>{f.index} · {f.height} px</option>)}
      </select>
    );
  } else if (name in CHOICES) {
    const opts = CHOICES[name]!.slice(0, def?.max ? Number(def.max) + 1 : undefined);
    input = (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((label, i) => <option key={i} value={i}>{label}</option>)}
      </select>
    );
  } else if (name === "txt" || def?.type === "Sstr") {
    input = <input id={id} className="inspector-text" type="text" value={value} onChange={(e) => onChange(e.target.value)} />;
  } else {
    input = <input id={id} className="inspector-num" type="number" min={def?.min} max={def?.max && Number(def.max) < 1e9 ? def.max : undefined} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  const maxl = obj.num("txt_maxl", 10);
  const tooLong = name === "txt" && value.length > maxl;
  return (
    <div className={`inspector-row ${changed ? "changed" : ""}`}>
      <label htmlFor={id} title={def?.desc ?? name}>
        <span className={`rtmark ${runtime ? "rt" : ""} ${live ? "live" : ""}`} role="img" aria-label={runtime ? "changes live" : "needs a build"} />
        {LABELS[name] ?? name}
        {LABELS[name] && <span className="att">{name}</span>}
      </label>
      {input}
      {tooLong && <span className="inspector-warn">longer than max length {maxl}: raise txt_maxl (needs a build)</span>}
    </div>
  );
}
