/** The project page: chat on the left, the project overview (stats and cards) on the right. */
import { useEffect, useMemo, useRef, useState } from "react";
import { ago, api, type BuildRecord, kb, type ProjectDetail } from "../api.ts";
import { BoardPicker } from "../components/BoardPicker.tsx";
import { ChatPanel } from "../components/ChatPanel.tsx";
import { Icon } from "../components/Icon.tsx";
import { NexPreview } from "../components/NexPreview.tsx";
import { boardKind, useDevice } from "../device.tsx";
import { parseHmi } from "../hmi.ts";
import { useProject } from "../useProject.ts";

export function ProjectPage({ id, navigate }: { id: string; navigate: (to: string) => void }) {
  const project = useProject(id);
  const { detail, error } = project;
  const device = useDevice();
  const fqbn = detail?.meta.board.fqbn;
  useEffect(() => {
    if (fqbn) device.setBoard(boardKind(fqbn));
  }, [fqbn, device.setBoard]);

  if (error) {
    return (
      <div className="page center">
        <div className="msg bad"><span className="led" /><div className="body"><b>Couldn't open this project.</b> {error}</div></div>
      </div>
    );
  }

  return (
    <div className="page app">
      <header className="appbar">
        <span className="wordmark">Nextion <b>Arduino</b></span>
        <nav aria-label="Breadcrumb">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>Projects</a>
          <a href={`/p/${id}`} className="current" aria-current="page">{detail?.meta.title ?? id}</a>
        </nav>
        <span className="spacer" />
        <DeviceStatus />
      </header>
      <div className="edge" />
      <div className="project-body">
        <ChatPanel project={project} />
        <main className="overview">
          {detail ? <Overview detail={detail} onFlashed={project.reload} /> : <div className="empty">Loading…</div>}
        </main>
      </div>
      {device.bootloaderPrompt ? <BootloaderPrompt /> : device.busy && !project.events.some((e) => e.kind === "flash" && e.status === "waiting") && <BusyToast />}
    </div>
  );
}

function DeviceStatus() {
  const device = useDevice();
  if (!device.supported) return <span className="device-status bad">This browser can't reach USB devices. Use Chrome or Edge.</span>;
  return (
    <>
      <span className="device-status">
        <span className={`led ${device.portLabel ? "on" : ""}`} />
        {device.portLabel ? `${device.portLabel}${device.display ? ` · ${device.display.model}` : ""}` : "No device"}
      </span>
      <button className="btn md quiet" type="button" onClick={() => device.choosePort()}>
        <Icon name="plug" />
        {device.portLabel ? "Change port…" : "Choose port…"}
      </button>
    </>
  );
}

/** WebHID can only be granted from a click, so the first Teensy flash stops here once. */
function BootloaderPrompt() {
  const device = useDevice();
  return (
    <div className="msg toast info busy-toast" role="alertdialog" aria-label="Allow the Teensy bootloader">
      <span className="led" />
      <div className="body">
        <b>Allow the Teensy bootloader</b>
        <span>Pick “Teensy HalfKay” in the list Chrome shows. If the list is empty, press the button on the Teensy first.</span>
        <div className="row">
          <button className="btn md quiet" type="button" onClick={device.cancelBootloader}>Cancel</button>
          <button className="btn md primary" type="button" onClick={() => void device.allowBootloader()}>
            <Icon name="zap" />
            Allow and flash
          </button>
        </div>
      </div>
    </div>
  );
}

function BusyToast() {
  const { busy } = useDevice();
  if (!busy) return null;
  const pct = busy.total ? Math.round(((busy.done ?? 0) * 100) / busy.total) : undefined;
  return (
    <div className="msg toast info busy-toast" role="status">
      <span className="led" />
      <div className="body">
        <b>{busy.label}</b>
        <div className="progress"><div className={`bar ${pct === undefined ? "busy" : ""}`}><i style={{ width: pct === undefined ? undefined : `${pct}%` }} /></div></div>
      </div>
    </div>
  );
}

function onDevice(builds: BuildRecord[], half: "sketch" | "screen"): BuildRecord | undefined {
  return builds
    .filter((b) => b.flashed?.[half])
    .sort((a, b) => (b.flashed![half]! > a.flashed![half]! ? 1 : -1))[0];
}

function Overview({ detail, onFlashed }: { detail: ProjectDetail; onFlashed: () => void }) {
  const { meta, builds } = detail;
  const device = useDevice();
  const hmi = useMemo(() => parseHmi(detail.hmi), [detail.hmi]);
  const latest = builds[0];
  const sketchOn = onDevice(builds, "sketch");
  const screenOn = onDevice(builds, "screen");
  const latestFlashable = latest && (latest.sketch?.ok || latest.screen?.ok);
  const latestOnDevice = latest && sketchOn?.n === latest.n && screenOn?.n === latest.n;
  const objects = hmi.pages.reduce((n, p) => n + p.objects.length, 0);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  const flashBuild = async (b: BuildRecord) => {
    if (!(await device.ensurePort())) return;
    setFlashMsg(null);
    const sketchUrl = b.sketch?.ok && b.sketch.file ? api.buildFileUrl(meta.id, b.n, b.sketch.file) : undefined;
    const screenUrl = b.screen?.ok && b.screen.file ? api.buildFileUrl(meta.id, b.n, b.screen.file) : undefined;
    const r = await device.flash({ sketchUrl, screenUrl, expectModel: meta.display.model });
    if (r.status === "done") await api.markFlashed(meta.id, b.n, { sketch: !!sketchUrl, screen: !!screenUrl });
    setFlashMsg(r.status === "done" ? `Build #${b.n}: ${r.message}.` : `Build #${b.n} failed: ${r.message}`);
    onFlashed();
  };

  return (
    <>
      <div className="overview-head">
        <div className="overview-title">
          <span className="eyebrow">Project</span>
          <h1>{meta.title}</h1>
          <p className="lead">{meta.description || "Describe the project in the chat and Claude fills this in."}</p>
        </div>
        {latestFlashable && !latestOnDevice && (
          <button className="btn md primary" type="button" disabled={!!device.busy} onClick={() => flashBuild(latest)}>
            <Icon name="zap" />
            Flash build #{latest.n}
          </button>
        )}
      </div>
      {flashMsg && (
        <div className={`msg ${flashMsg.includes("failed") ? "bad" : "ok"}`} role="status"><span className="led" /><div className="body">{flashMsg}</div></div>
      )}

      <div className="stats">
        <div className="card stat">
          <span className="eyebrow">Sketch</span>
          {latest?.sketch?.ok ? (
            <>
              <span className="value">{kb(latest.sketch.bytes)}<small>of {kb(latest.sketch.max)} KB</small></span>
              <span className="delta">{meta.board.name}</span>
            </>
          ) : (
            <>
              <span className="value">—</span>
              <span className={`delta ${latest?.sketch && !latest.sketch.ok ? "bad" : ""}`}>{latest?.sketch && !latest.sketch.ok ? "last build failed" : "not built yet"}</span>
            </>
          )}
        </div>
        <div className="card stat">
          <span className="eyebrow">Screen</span>
          {latest?.screen?.ok ? (
            <span className="value">{kb(latest.screen.bytes)}<small>KB</small></span>
          ) : (
            <span className="value">—</span>
          )}
          <span className={`delta ${latest?.screen && !latest.screen.ok ? "bad" : ""}`}>
            {latest?.screen && !latest.screen.ok ? "last build failed" : `${hmi.pages.length} page${hmi.pages.length === 1 ? "" : "s"} · ${objects} objects`}
          </span>
        </div>
        <div className="card stat">
          <span className="eyebrow">On device</span>
          <span className="value">{sketchOn || screenOn ? `#${Math.max(sketchOn?.n ?? 0, screenOn?.n ?? 0)}` : "—"}</span>
          <span className="delta">{sketchOn || screenOn ? `flashed ${ago(sketchOn?.flashed?.sketch ?? screenOn?.flashed?.screen)}` : "nothing flashed yet"}</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Device</span>
          <span className="value small">{device.portLabel ? "Connected" : "None"}</span>
          <span className="delta">{device.display ? `${device.display.model} · fw ${device.display.firmware}` : device.portLabel ? "display not checked yet" : "choose the board's port"}</span>
        </div>
      </div>

      <div className="cards-2">
        <ScreenCard detail={detail} />
        <SketchCard detail={detail} />
        <HardwareCard detail={detail} onChanged={onFlashed} />
        <BuildsCard detail={detail} onFlash={flashBuild} />
      </div>
    </>
  );
}

function ScreenCard({ detail }: { detail: ProjectDetail }) {
  const hmi = useMemo(() => parseHmi(detail.hmi), [detail.hmi]);
  const [pageIdx, setPageIdx] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const page = hmi.pages[Math.min(pageIdx, hmi.pages.length - 1)];
  const d = detail.meta.display;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="h3">Screen</h2>
        {hmi.pages.length > 1 && (
          <div className="seg" role="group" aria-label="Page">
            {hmi.pages.map((p, i) => (
              <button key={p.name + i} type="button" className={i === pageIdx ? "checked" : ""} aria-pressed={i === pageIdx} onClick={() => setPageIdx(i)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={box}>
        {hmi.error ? (
          <div className="msg bad"><span className="led" /><div className="body">{hmi.error}</div></div>
        ) : page && width > 0 ? (
          <NexPreview page={page} width={d.width} height={d.height} fonts={detail.fonts} displayWidth={width} />
        ) : null}
      </div>
      <div className="card-foot">{d.width} × {d.height} · {d.model} · approximate preview</div>
    </section>
  );
}

function SketchCard({ detail }: { detail: ProjectDetail }) {
  const src = detail.sketch;
  const lead = src
    .split("\n")
    .filter((l) => /^\s*\/\//.test(l))
    .slice(0, 4)
    .map((l) => l.replace(/^\s*\/\/\s?/, ""))
    .join(" ");
  const includes = [...src.matchAll(/#include\s+[<"]([^>"]+)[>"]/g)].map((m) => m[1]!.replace(/\.h$/, ""));
  const files = detail.files.filter((f) => f.path.startsWith("sketch/")).map((f) => f.path.slice(7));
  const loc = src.split("\n").length;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="h3">Sketch</h2>
        <span className="note">{loc} lines</span>
      </div>
      <p className="card-text">{lead || "No description comment at the top of sketch.ino yet."}</p>
      <div className="card-foot">
        {files.join(" · ")}
        {includes.length > 0 && ` · uses ${includes.join(", ")}`}
      </div>
    </section>
  );
}

function HardwareCard({ detail, onChanged }: { detail: ProjectDetail; onChanged: () => void }) {
  const [boardError, setBoardError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const pick = async (id: string) => {
    setBoardError(null);
    setSwitching(true);
    try {
      await api.setBoard(detail.meta.id, id);
      onChanged();
    } catch (e) {
      setBoardError((e as Error).message);
    } finally {
      setSwitching(false);
    }
  };
  const rows = detail.hardware
    .split("\n")
    .filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const [head, ...body] = rows;
  const notes = detail.hardware
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("|") && !l.startsWith("#"))
    .slice(0, 2)
    .join(" ");
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="h3">Hardware</h2>
        <BoardPicker fqbn={detail.meta.board.fqbn} disabled={switching || detail.busy} onPick={(b) => void pick(b.id)} />
      </div>
      {boardError && <p className="card-text bad">{boardError}</p>}
      {notes && <p className="card-text">{notes}</p>}
      {body.length > 0 ? (
        <table className="table dense">
          {head && (
            <thead>
              <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 ? "mono" : ""}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="card-text dim">No wiring table yet. Tell Claude how things are connected.</p>
      )}
    </section>
  );
}

function BuildsCard({ detail, onFlash }: { detail: ProjectDetail; onFlash: (b: BuildRecord) => void }) {
  const device = useDevice();
  const builds = detail.builds.slice(0, 6);
  const status = (b: BuildRecord) => {
    if ((b.sketch && !b.sketch.ok) || (b.screen && !b.screen.ok)) return { text: "failed", cls: "hot" };
    if (b.flashed?.sketch || b.flashed?.screen) return { text: `flashed ${ago(b.flashed.sketch ?? b.flashed.screen)}`, cls: "dim" };
    return { text: ago(b.createdAt), cls: "dim" };
  };
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="h3">Builds</h2>
        <span className="note">{detail.builds.length}</span>
      </div>
      {builds.length === 0 ? (
        <p className="card-text dim">No builds yet. Claude builds after changing the sketch or the screen.</p>
      ) : (
        <table className="table dense">
          <tbody>
            {builds.map((b, i) => {
              const s = status(b);
              const flashable = (b.sketch?.ok || b.screen?.ok) && s.cls !== "hot";
              return (
                <tr key={b.n} className={i === 0 ? "selected" : ""}>
                  <td className="mono">#{b.n}</td>
                  <td>{b.label}</td>
                  <td className={s.cls}>{s.text}</td>
                  <td className="num">
                    {b.sketch?.ok && b.sketch.file && s.cls !== "hot" && (
                      <a
                        className="btn quiet"
                        href={api.buildFileUrl(detail.meta.id, b.n, b.sketch.file)}
                        download={`${detail.meta.id}-build${b.n}.hex`}
                        title="Download the sketch (for Teensy Loader or another flasher)"
                        aria-label={`Download build ${b.n} sketch hex`}
                      >
                        .hex
                      </a>
                    )}
                    {flashable && (
                      <button className="btn quiet" type="button" disabled={!!device.busy} onClick={() => onFlash(b)} aria-label={`Flash build ${b.n}`}>
                        Flash
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
