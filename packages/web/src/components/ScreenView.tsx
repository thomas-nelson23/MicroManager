/** The screen tab: a preview of each page beside the list of its components. Clicking one puts its name in the message box. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectDetail } from "../api.ts";
import { parseHmi } from "../hmi.ts";
import { NexPreview } from "./NexPreview.tsx";

/** The preview never grows past this multiple of the display's real pixel size. */
const MAX_SCALE = 1.5;

export function ScreenView({ detail, onInsert }: { detail: ProjectDetail; onInsert: (name: string) => void }) {
  const hmi = useMemo(() => parseHmi(detail.hmi), [detail.hmi]);
  const [pageIdx, setPageIdx] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const page = hmi.pages[Math.min(pageIdx, hmi.pages.length - 1)];
  const d = detail.meta.display;
  const width = Math.floor(Math.min(avail, d.width * MAX_SCALE));

  return (
    <div className="screen-view">
      <div className="screen-main">
        <div className="screen-bar">
          {hmi.pages.length > 1 ? (
            <div className="seg md" role="group" aria-label="Page">
              {hmi.pages.map((p, i) => (
                <button key={p.name + i} type="button" className={i === pageIdx ? "checked" : ""} aria-pressed={i === pageIdx} onClick={() => setPageIdx(i)}>
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <span className="eyebrow">Page {page?.name ?? ""}</span>
          )}
          <span className="note">{d.width} × {d.height} · {d.model} · approximate preview</span>
        </div>
        <div ref={box} className="screen-stage">
          {hmi.error ? (
            <div className="msg bad"><span className="led" /><div className="body">{hmi.error}</div></div>
          ) : page && width > 0 ? (
            <NexPreview page={page} width={d.width} height={d.height} fonts={detail.fonts} displayWidth={width} highlight={hover} onHover={setHover} onPick={onInsert} />
          ) : null}
        </div>
      </div>
      <aside className="screen-side panel">
        <div className="panel-head">
          <h3 className="h4">Components</h3>
          <span className="note">{page?.objects.length ?? 0}</span>
        </div>
        {page && page.objects.length > 0 ? (
          <table className="table dense">
            <thead><tr><th>Name</th><th>Type</th><th>Shows</th></tr></thead>
            <tbody>
              {page.objects.map((o, i) => (
                <tr key={`${o.name}-${i}`} className={`pick ${hover === o.name ? "selected" : ""}`} onMouseEnter={() => setHover(o.name)} onMouseLeave={() => setHover(null)} onClick={() => onInsert(o.name)} title="Click to put this name in the message box">
                  <td className="mono">{o.name}</td>
                  <td className="dim">{o.typeName}</td>
                  <td className="clip">{o.get("txt") || (o.attrs.val !== undefined ? o.attrs.val : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="card-text dim">This page has no components yet.</p>
        )}
        <span className="help">Click a component, here or in the preview, to put its name in the message box.</span>
      </aside>
    </div>
  );
}
