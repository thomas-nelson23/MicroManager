/** Read-only view of the project's source files, with the lines changed since the last turn marked. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { FileStore } from "../useFiles.ts";

const order = (p: string) => (p === "sketch/sketch.ino" ? 0 : p.startsWith("sketch/") ? 1 : p === "nextion/hmi.txt" ? 2 : p === "wiring.json" ? 3 : 4);

/** Indexes of lines in `now` that are new or changed compared with `was`. */
export function changedLines(was: string, now: string): Set<number> {
  const a = was.split("\n");
  const b = now.split("\n");
  const out = new Set<number>();
  if (was === now) return out;
  if (a.length * b.length > 4_000_000) {
    const old = new Set(a);
    b.forEach((l, i) => !old.has(l) && out.add(i));
    return out;
  }
  // longest common subsequence, then everything in b outside it is changed
  const w = b.length + 1;
  const t = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1]! + 1 : Math.max(t[(i + 1) * w + j]!, t[i * w + j + 1]!);
  let i = 0;
  let j = 0;
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < a.length && t[(i + 1) * w + j]! >= t[i * w + j + 1]!) i++;
    else out.add(j++);
  }
  return out;
}

export function CodeView({ store, jump }: { store: FileStore; jump: { path: string; line: number; key: number } | null }) {
  const files = useMemo(() => [...store.files].sort((a, b) => order(a.path) - order(b.path) || a.path.localeCompare(b.path)), [store.files]);
  const [path, setPath] = useState(jump?.path ?? "sketch/sketch.ino");
  const pre = useRef<HTMLDivElement>(null);
  const active = files.some((f) => f.path === path) ? path : files[0]?.path;

  useEffect(() => {
    if (active) store.open(active);
  }, [active, store]);
  useEffect(() => {
    if (jump) setPath(jump.path);
  }, [jump]);

  const text = active ? store.contents.get(active) : undefined;
  const base = active ? store.baseline.get(active) : undefined;
  const changed = useMemo(() => (text !== undefined && base !== undefined ? changedLines(base, text) : new Set<number>()), [text, base]);
  const lines = text?.split("\n") ?? [];

  useEffect(() => {
    if (!jump || jump.path !== active || text === undefined) return;
    pre.current?.querySelector(`[data-line="${jump.line}"]`)?.scrollIntoView({ block: "center" });
  }, [jump, active, text]);

  return (
    <div className="code-view">
      <nav className="code-files" aria-label="Files">
        {files.map((f) => (
          <button key={f.path} type="button" className={`code-file ${f.path === active ? "checked" : ""}`} onClick={() => setPath(f.path)}>
            <span>{f.path}</span>
            {store.changed.has(f.path) && <i className="dot" title="Changed in the last turn" />}
          </button>
        ))}
      </nav>
      <div className="code-pane">
        <div className="code-head">
          <span className="mono">{active}</span>
          <span className="note">
            {lines.length} lines{changed.size ? ` · ${changed.size} changed in the last turn` : ""} · read-only, ask Claude to change it
          </span>
        </div>
        <div className="code-body" ref={pre}>
          {text === undefined ? (
            <div className="empty">Loading…</div>
          ) : (
            lines.map((l, i) => (
              <div key={i} data-line={i + 1} className={`code-line ${changed.has(i) ? "changed" : ""} ${jump && jump.path === active && jump.line === i + 1 ? "target" : ""}`}>
                <span className="ln">{i + 1}</span>
                <span className="lc">{l || " "}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
