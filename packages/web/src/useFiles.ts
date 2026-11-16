/** The project's text files as the Code tab shows them, with a snapshot from before the last turn to mark what changed. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ProjectDetail } from "./api.ts";

const TEXT = /\.(ino|h|hpp|c|cpp|txt|json|md)$/i;

export interface FileStore {
  files: { path: string; bytes: number }[];
  contents: Map<string, string>;
  baseline: Map<string, string>;
  /** Paths whose content differs from the snapshot. */
  changed: Set<string>;
  open(path: string): void;
}

export function useFiles(id: string, detail: ProjectDetail | null, busy: boolean): FileStore {
  const [contents, setContents] = useState(new Map<string, string>());
  const [baseline, setBaseline] = useState(new Map<string, string>());
  const wanted = useRef(new Set<string>());
  const files = useMemo(() => (detail?.files ?? []).filter((f) => TEXT.test(f.path) && f.bytes < 400_000), [detail?.files]);

  const fetchAll = useCallback(async () => {
    const got = await Promise.all([...wanted.current].map(async (p) => [p, await api.file(id, p).catch(() => null)] as const));
    setContents((cur) => {
      const next = new Map(cur);
      for (const [p, t] of got) if (t !== null) next.set(p, t);
      return next;
    });
    setBaseline((cur) => {
      const next = new Map(cur);
      for (const [p, t] of got) if (t !== null && !next.has(p)) next.set(p, t);
      return next;
    });
  }, [id]);

  // Every source file is tracked from the start, so a change shows even in a file nobody opened.
  useEffect(() => {
    let added = false;
    for (const f of files) {
      if (!wanted.current.has(f.path)) {
        wanted.current.add(f.path);
        added = true;
      }
    }
    if (added || detail) void fetchAll();
  }, [files, detail, fetchAll]);

  // A new turn starts: what is on screen now becomes the "before".
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (busy && !wasBusy.current) setBaseline(new Map(contents));
    wasBusy.current = busy;
  }, [busy, contents]);

  const open = useCallback(
    (path: string) => {
      if (wanted.current.has(path)) return;
      wanted.current.add(path);
      void fetchAll();
    },
    [fetchAll],
  );

  const changed = useMemo(() => {
    const s = new Set<string>();
    for (const [p, t] of contents) if (baseline.has(p) && baseline.get(p) !== t) s.add(p);
    return s;
  }, [contents, baseline]);

  return useMemo(() => ({ files, contents, baseline, changed, open }), [files, contents, baseline, changed, open]);
}
