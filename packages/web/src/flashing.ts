/** Flashing a build from the page (outside the chat): which halves, with a check before risky ones. */
import { useCallback, useState } from "react";
import { api, type BuildRecord, type ProjectDetail } from "./api.ts";
import type { Ask } from "./components/Dialog.tsx";
import { useDevice } from "./device.tsx";

export type Parts = "both" | "sketch" | "screen";

export function onDevice(builds: BuildRecord[], half: "sketch" | "screen"): BuildRecord | undefined {
  return builds.filter((b) => b.flashed?.[half]).sort((a, b) => (b.flashed![half]! > a.flashed![half]! ? 1 : -1))[0];
}

/** Why a build doesn't fit the project's current hardware, or null when it does (or can't be told). */
export function staleReason(b: BuildRecord, detail: ProjectDetail, parts: Parts = "both"): string | null {
  const why: string[] = [];
  if (parts !== "screen" && b.sketch?.ok && b.board && b.board !== detail.meta.board.fqbn) why.push("its sketch was built for another board");
  if (parts !== "sketch" && b.screen?.ok && b.display && b.display !== detail.meta.display.model) why.push(`its screen was built for ${b.display}`);
  return why.length ? why.join(" and ") : null;
}

export const buildOk = (b: BuildRecord) => (!b.sketch || b.sketch.ok) && (!b.screen || b.screen.ok);
export const flashable = (b: BuildRecord) => !!(b.sketch?.ok || b.screen?.ok);

export function useFlasher(detail: ProjectDetail | null, reload: () => void, ask: (a: Ask) => Promise<string | boolean>) {
  const device = useDevice();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = useState<number | null>(null);

  const flash = useCallback(
    async (b: BuildRecord, parts: Parts = "both") => {
      if (!detail) return;
      const { meta, builds } = detail;
      const stale = staleReason(b, detail, parts);
      if (stale && !(await ask({ title: `Flash build #${b.n} anyway?`, body: `The project's board or display changed since this build: ${stale}. Rebuild first unless you know it fits.`, confirm: "Flash anyway", danger: true }))) return;
      const current = Math.max(onDevice(builds, "sketch")?.n ?? 0, onDevice(builds, "screen")?.n ?? 0);
      if (!stale && b.n < current && !(await ask({ title: `Go back to build #${b.n}?`, body: `Build #${current} is on the device now. This puts the older build "${b.label}" back on it.`, confirm: `Flash build #${b.n}` }))) return;
      if (!(await device.ensurePort())) return;
      setResult(null);
      setRunning(b.n);
      const sketchUrl = parts !== "screen" && b.sketch?.ok && b.sketch.file ? api.buildFileUrl(meta.id, b.n, b.sketch.file) : undefined;
      const screenUrl = parts !== "sketch" && b.screen?.ok && b.screen.file ? api.buildFileUrl(meta.id, b.n, b.screen.file) : undefined;
      const r = await device.flash({ sketchUrl, screenUrl, expectModel: meta.display.model });
      if (r.status === "done") await api.markFlashed(meta.id, b.n, { sketch: !!sketchUrl, screen: !!screenUrl });
      setRunning(null);
      setResult({ ok: r.status === "done", text: r.status === "done" ? `Build #${b.n}: ${r.message}.` : `Build #${b.n} failed: ${r.message}` });
      reload();
    },
    [detail, device, reload, ask],
  );

  return { flash, result, clearResult: () => setResult(null), running };
}

export type Flasher = ReturnType<typeof useFlasher>;
