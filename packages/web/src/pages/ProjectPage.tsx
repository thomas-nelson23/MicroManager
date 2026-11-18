/** The project page: chat on the left, and on the right a status strip over one large tabbed area. */
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boardByUsb } from "@nextion-arduino/server/boards";
import { displayByReported } from "@nextion-arduino/server/displays";
import { api, type ProjectDetail } from "../api.ts";
import { displayLabel, useBoards, useConfig, useDisplays } from "../catalog.ts";
import { BuildsView } from "../components/BuildsView.tsx";
import { ChatPanel } from "../components/ChatPanel.tsx";
import { CodeView } from "../components/CodeView.tsx";
import { type Ask, useDialog } from "../components/Dialog.tsx";
import { DeviceConsole } from "../components/DeviceConsole.tsx";
import { Icon } from "../components/Icon.tsx";
import { ScreenView } from "../components/ScreenView.tsx";
import { WiringView } from "../components/WiringView.tsx";
import { boardKind, useDevice } from "../device.tsx";
import { buildOk, type Flasher, onDevice, staleReason, useFlasher } from "../flashing.ts";
import { useFiles } from "../useFiles.ts";
import { type ProjectState, useProject } from "../useProject.ts";

type Tab = "chat" | "screen" | "wiring" | "code" | "builds" | "device";
const TABS: { id: Tab; label: string }[] = [
  { id: "screen", label: "Screen" },
  { id: "wiring", label: "Wiring" },
  { id: "code", label: "Code" },
  { id: "builds", label: "Builds" },
  { id: "device", label: "Device" },
];
const isTab = (s: string): s is Tab => s === "chat" || TABS.some((t) => t.id === s);

function useNarrow(px: number) {
  const [narrow, setNarrow] = useState(() => matchMedia(`(max-width: ${px}px)`).matches);
  useEffect(() => {
    const mq = matchMedia(`(max-width: ${px}px)`);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [px]);
  return narrow;
}

const stored = (key: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
};
const store = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* private mode */
  }
};

export function ProjectPage({ id, navigate }: { id: string; navigate: (to: string) => void }) {
  const project = useProject(id);
  const { detail, error } = project;
  const device = useDevice();
  const dialog = useDialog();
  const narrow = useNarrow(900);
  const fqbn = detail?.meta.board.fqbn;
  useEffect(() => {
    if (fqbn) device.setBoard(boardKind(fqbn));
  }, [fqbn, device.setBoard]);

  useEffect(() => {
    document.title = detail ? `${detail.meta.title} · Nextion Arduino` : "Nextion Arduino";
    return () => {
      document.title = "Nextion Arduino";
    };
  }, [detail?.meta.title]);

  // The message box lives here so the other panes can write into it.
  const [draft, setDraft] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const [tab, setTabState] = useState<Tab>(() => {
    const h = location.hash.slice(1);
    return isTab(h) ? h : "screen";
  });
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", `${location.pathname}#${t}`);
  }, []);
  const shown: Tab = !narrow && tab === "chat" ? "screen" : tab;

  const toChat = useCallback(
    (text: string, how: "replace" | "append" = "replace") => {
      setDraft((d) => (how === "append" ? `${d}${d && !/\s$/.test(d) ? " " : ""}${text} ` : d.trim() ? `${d.trim()}\n${text}` : text));
      setFocusKey((k) => k + 1);
      setCollapsed(false);
      if (matchMedia("(max-width: 900px)").matches) setTab("chat");
    },
    [setTab],
  );

  const [chatW, setChatW] = useState(() => stored("chat-width", 440));
  const [collapsed, setCollapsed] = useState(() => stored("chat-collapsed", 0) === 1);
  useEffect(() => store("chat-collapsed", collapsed ? "1" : "0"), [collapsed]);
  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => setChatW(Math.max(320, Math.min(Math.round(window.innerWidth * 0.6), ev.clientX)));
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setChatW((w) => (store("chat-width", String(w)), w));
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };

  const flasher = useFlasher(detail, project.reload, dialog.ask);
  const files = useFiles(id, detail, project.busy);
  const [jump, setJump] = useState<{ path: string; line: number; key: number } | null>(null);

  // A dot on a tab whose content changed while it wasn't open.
  const sig = useMemo<Record<Tab, string>>(
    () => ({
      chat: String(project.events.length),
      screen: detail?.hmi ?? "",
      wiring: JSON.stringify(detail?.wiring ?? null),
      code: [...files.contents].filter(([p]) => p !== "nextion/hmi.txt" && p !== "wiring.json").map(([p, t]) => `${p}:${t.length}:${t.slice(0, 2000)}`).join("|"),
      builds: (detail?.builds ?? []).map((b) => `${b.n}${b.flashed?.sketch ?? ""}${b.flashed?.screen ?? ""}`).join(","),
      // messages the sketch sent on its own
      device: String(device.log.filter((e) => e.reply && "sketch" in e.reply).length),
    }),
    [project.events.length, detail, files.contents, device.log],
  );
  const seen = useRef<Partial<Record<Tab, string>>>({});
  const ready = !!detail && files.contents.size > 0;
  for (const t of Object.keys(sig) as Tab[]) if (ready && (seen.current[t] === undefined || t === shown || (t === "chat" && !narrow))) seen.current[t] = sig[t];
  const badge = (t: Tab) => ready && seen.current[t] !== undefined && seen.current[t] !== sig[t];

  if (error) {
    return (
      <div className="page center">
        <div className="msg bad">
          <span className="led" />
          <div className="body">
            <b>Couldn't open this project.</b> {error}
            <div className="row">
              <button className="btn md quiet" type="button" onClick={() => navigate("/")}><Icon name="chevronLeft" />All projects</button>
              <button className="btn md" type="button" onClick={() => location.reload()}><Icon name="refresh" />Try again</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const chat = <ChatPanel project={project} draft={draft} setDraft={setDraft} focusKey={focusKey} onCollapse={narrow ? undefined : () => setCollapsed(true)} />;
  return (
    <div className="page app">
      <header className="appbar">
        <span className="wordmark">Nextion <b>Arduino</b></span>
        <nav aria-label="Breadcrumb">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>Projects</a>
          <a href={`/p/${id}`} className="current" aria-current="page">{detail?.meta.title ?? id}</a>
        </nav>
      </header>
      <div className="edge" />
      <div className={`project-body ${narrow ? "narrow" : ""}`}>
        {!narrow && !collapsed && (
          <>
            <div className="chat-col" style={{ width: chatW }}>{chat}</div>
            <div className="splitter" role="separator" aria-orientation="vertical" aria-label="Resize the chat" onPointerDown={drag} onDoubleClick={() => setChatW(440)} />
          </>
        )}
        {!narrow && collapsed && (
          <button className="chat-rail" type="button" onClick={() => setCollapsed(false)} aria-label="Show the chat">
            <Icon name="chat" />
            <span>Chat</span>
            {project.busy && <i className="dot live" />}
          </button>
        )}
        <main className="bench">
          {detail ? (
            <>
              <StatusStrip detail={detail} project={project} flasher={flasher} ask={dialog.ask} toChat={toChat} navigate={navigate} onBuilds={() => setTab("builds")} />
              <div className="tabs bench-tabs" role="tablist">
                {narrow && (
                  <button type="button" role="tab" aria-selected={shown === "chat"} className={shown === "chat" ? "checked" : ""} onClick={() => setTab("chat")}>
                    Chat{project.busy ? <i className="dot live" /> : badge("chat") ? <i className="dot" /> : null}
                  </button>
                )}
                {TABS.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={shown === t.id} className={shown === t.id ? "checked" : ""} onClick={() => setTab(t.id)}>
                    {t.label}
                    {badge(t.id) && <i className="dot" title="Changed since you last looked" />}
                  </button>
                ))}
              </div>
              <div className={`bench-pane pane-${shown}`} role="tabpanel">
                {shown === "chat" && chat}
                {shown === "screen" && (
                  <ScreenView
                    detail={detail}
                    onInsert={(name) => toChat(name, "append")}
                    onShipScreen={async () => {
                      // built in the container and flashed from the browser: no Claude turn
                      const b = await api.rebuild(id, "screen");
                      project.reload();
                      if (!b.screen?.ok) return { ok: false, text: `Screen build #${b.n} failed: ${b.screen?.error ?? "unknown error"}` };
                      await flasher.flash(b, "screen");
                      return { ok: true, text: `Built screen #${b.n}. The flash result shows in the status bar.` };
                    }}
                  />
                )}
                {shown === "wiring" && (
                  <WiringPane
                    detail={detail}
                    onAsk={toChat}
                    onOpenSketchLine={(line) => {
                      setJump({ path: "sketch/sketch.ino", line, key: Date.now() });
                      setTab("code");
                    }}
                  />
                )}
                {shown === "code" && <CodeView store={files} jump={jump} />}
                {shown === "builds" && <BuildsView detail={detail} flasher={flasher} />}
                {shown === "device" && <DeviceConsole hmiText={detail.hmi} />}
              </div>
            </>
          ) : (
            <div className="empty">Loading…</div>
          )}
        </main>
      </div>
      {device.bootloaderPrompt ? <BootloaderPrompt /> : device.busy && flasher.running === null && !project.events.some((e) => e.kind === "flash" && e.status === "waiting") && <BusyToast />}
      {dialog.node}
    </div>
  );
}

function WiringPane({ detail, onAsk, onOpenSketchLine }: { detail: ProjectDetail; onAsk: (t: string) => void; onOpenSketchLine: (line: number) => void }) {
  const boards = useBoards();
  const board = boards.find((b) => b.fqbn === detail.meta.board.fqbn);
  if (boards.length === 0) return <div className="empty">Loading…</div>;
  return (
    <WiringView
      board={board}
      boardName={detail.meta.board.name}
      wiring={detail.wiring}
      wiringError={detail.wiringError}
      legacy={detail.wiringSource === "hardware.md" && detail.wiring.connections.length > 0}
      sketch={detail.sketch}
      onAsk={onAsk}
      onOpenSketchLine={onOpenSketchLine}
    />
  );
}

interface StripProps {
  detail: ProjectDetail;
  project: ProjectState;
  flasher: Flasher;
  ask: (a: Ask) => Promise<string | boolean>;
  toChat: (text: string) => void;
  navigate: (to: string) => void;
  onBuilds: () => void;
}

/** One line for what the project is, what it targets, what's plugged in, and flashing. */
function StatusStrip({ detail, project, flasher, ask, toChat, navigate, onBuilds }: StripProps) {
  const { meta, builds } = detail;
  const device = useDevice();
  const boards = useBoards();
  const displays = useDisplays();
  const config = useConfig();
  const [menu, setMenu] = useState<"project" | "flash" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = project.busy || !!device.busy;

  const board = boards.find((b) => b.fqbn === meta.board.fqbn);
  const plugged = device.usb ? boardByUsb(device.usb.vendorId, device.usb.productId) : undefined;
  const wrongBoard = plugged && board && plugged.id !== board.id ? plugged : null;
  const reported = device.display?.model;
  const wrongDisplay = reported && !reported.startsWith(meta.display.model) ? reported : null;
  const detectedDisplay = wrongDisplay ? displayByReported(wrongDisplay) : undefined;

  const hasWork = builds.length > 0 || detail.wiring.connections.some((c) => !/display|nextion/i.test(c.part));
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      project.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // A rebuild is the server's job: no Claude turn for it.
  const [rebuilding, setRebuilding] = useState(false);
  const rebuild = async () => {
    setRebuilding(true);
    const sketchStale = !!latest?.sketch?.ok && !!latest.board && latest.board !== meta.board.fqbn;
    const screenStale = !!latest?.screen?.ok && !!latest.display && latest.display !== meta.display.model;
    await run(() => api.rebuild(meta.id, sketchStale && screenStale ? "both" : screenStale ? "screen" : "sketch"));
    setRebuilding(false);
  };

  const changeBoard = async (boardId: string) => {
    const next = boards.find((b) => b.id === boardId);
    if (!next || next.fqbn === meta.board.fqbn) return;
    if (
      hasWork &&
      !(await ask({
        title: `Switch to ${next.name}?`,
        body: (
          <>
            <p>The sketch must be rebuilt for the new board, and builds made so far are marked as made for other hardware.</p>
            <p>The app renames the wiring's pins for the new board. Check the Wiring tab afterwards, then build again.</p>
            {!next.fiveVoltTolerant && <p><b>{next.name} runs at {next.volts} V and its pins are not 5 V tolerant.</b> Parts that output 5 V need a level shifter.</p>}
          </>
        ),
        confirm: `Switch to ${next.name}`,
      }))
    )
      return;
    await run(() => api.update(meta.id, { board: next.id }));
  };

  const changeDisplay = async (model: string) => {
    const next = displays.find((d) => d.model === model);
    if (!next || next.model === meta.display.model) return;
    const resized = next.width !== meta.display.width || next.height !== meta.display.height;
    if (
      builds.length > 0 &&
      !(await ask({
        title: `Switch to ${next.model}?`,
        body: (
          <>
            <p>The screen must be rebuilt for the new display, and screens built so far are marked as made for other hardware.</p>
            {resized ? (
              <p>The new display is {next.width} × {next.height}, not {meta.display.width} × {meta.display.height}. The app scales every component's position and size to fit. Fonts keep their size, so check the Screen tab afterwards.</p>
            ) : (
              <p>The resolution is the same, so the layout carries over.</p>
            )}
          </>
        ),
        confirm: `Switch to ${next.model}`,
      }))
    )
      return;
    await run(() => api.update(meta.id, { display: next.model }));
  };

  const rename = async () => {
    setMenu(null);
    const title = await ask({ title: "Rename the project", body: null, confirm: "Rename", input: { label: "Name", value: meta.title } });
    if (typeof title === "string") await run(() => api.update(meta.id, { title }));
  };
  const duplicate = async () => {
    setMenu(null);
    const title = await ask({ title: "Duplicate the project", body: <p>The copy gets the sketch, the screen and the wiring. Builds and the conversation stay with the original.</p>, confirm: "Duplicate", input: { label: "Name of the copy", value: `${meta.title} copy` } });
    if (typeof title !== "string") return;
    try {
      const p = await api.duplicate(meta.id, title);
      navigate(`/p/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    setMenu(null);
    if (!(await ask({ title: `Delete "${meta.title}"?`, body: <p>The project leaves the list. Its folder is moved to the server's trash folder, not erased, so it can be restored by hand.</p>, confirm: "Delete", danger: true }))) return;
    try {
      await api.remove(meta.id);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Flash state
  const latest = builds[0];
  const sketchOn = onDevice(builds, "sketch");
  const screenOn = onDevice(builds, "screen");
  const latestOn = latest && (!latest.sketch?.ok || sketchOn?.n === latest.n) && (!latest.screen?.ok || screenOn?.n === latest.n) && (sketchOn?.n === latest.n || screenOn?.n === latest.n);
  const stale = latest ? staleReason(latest, detail) : null;
  const pct = device.busy?.total ? Math.round(((device.busy.done ?? 0) * 100) / device.busy.total) : undefined;

  return (
    <div className="strip-wrap">
      <div className="status-strip">
        <div className="strip-title">
          <h1 title={meta.description || undefined}>{meta.title}</h1>
          <div className="pop-anchor">
            <button className="btn quiet icon-only" type="button" aria-label="Project menu" aria-expanded={menu === "project"} onClick={() => setMenu(menu === "project" ? null : "project")}><Icon name="more" /></button>
            {menu === "project" && (
              <div className="menu pop" role="menu" onMouseLeave={() => setMenu(null)}>
                <button className="item" type="button" role="menuitem" onClick={rename}>Rename…</button>
                <button className="item" type="button" role="menuitem" onClick={duplicate}>Duplicate…</button>
                <span className="sep" />
                <button className="item danger" type="button" role="menuitem" disabled={project.busy} onClick={remove}>Delete…</button>
              </div>
            )}
          </div>
        </div>

        <label className="chip" title="The board this project is built for">
          <span className="chip-key">Board</span>
          <select value={board?.id ?? ""} disabled={locked || boards.length === 0} onChange={(e) => void changeBoard(e.target.value)}>
            {!board && <option value="">{meta.board.name}</option>}
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="chip" title="The display this project's screen is built for">
          <span className="chip-key">Display</span>
          <select value={displays.some((d) => d.model === meta.display.model) ? meta.display.model : ""} disabled={locked || displays.length === 0} onChange={(e) => void changeDisplay(e.target.value)}>
            {!displays.some((d) => d.model === meta.display.model) && <option value="">{displayLabel(meta.display)}</option>}
            {(["Intelligent", "Enhanced", "Discovery", "Basic"] as const).map((series) => (
              <optgroup key={series} label={series}>
                {displays.filter((d) => d.series === series).map((d) => <option key={d.model} value={d.model}>{displayLabel(d)} · {d.inches}″</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        <span className="spacer" />

        {device.supported ? (
          <span className="chip device">
            <span className={`led ${device.portLabel ? "on" : ""}`} />
            <span className="chip-text">{device.portLabel ? `${device.portLabel}${device.display ? ` · ${device.display.model}` : ""}` : "No device"}</span>
            <button className="btn quiet" type="button" onClick={() => device.choosePort()}>{device.portLabel ? "Change…" : "Choose port…"}</button>
            {device.portLabel && !device.display && (
              <button className="btn quiet" type="button" disabled={locked} title="Ask the display which model it is, through the running sketch" onClick={() => void device.run([]).catch((e: Error) => setError(`Couldn't reach the display: ${e.message}`))}>
                Check display
              </button>
            )}
          </span>
        ) : (
          <span className="chip device bad"><Icon name="alert" /><span className="chip-text">{device.insecure ? "USB is blocked on this address" : "This browser has no USB access"}</span></span>
        )}

        <div className="flash-ctl">
          {flasher.running !== null && device.busy ? (
            <div className="flash-live" role="status">
              <span>{device.busy.label}{pct !== undefined ? ` · ${pct} %` : ""}</span>
              <div className="progress"><div className={`bar ${pct === undefined ? "busy" : ""}`}><i style={{ width: pct === undefined ? undefined : `${pct}%` }} /></div></div>
            </div>
          ) : !latest ? (
            <span className="flash-state">Nothing to flash yet</span>
          ) : !buildOk(latest) ? (
            <button className="btn md" type="button" onClick={onBuilds}><Icon name="alert" />Build #{latest.n} failed</button>
          ) : (
            <span className="pop-anchor split">
              {latestOn ? (
                <span className="flash-state on"><Icon name="check" />Build #{latest.n} is on the device</span>
              ) : (
                <button className={`btn md ${stale ? "" : "primary"}`} type="button" disabled={!!device.busy || !device.supported} onClick={() => void flasher.flash(latest)}>
                  <Icon name="zap" />Flash build #{latest.n}
                </button>
              )}
              <button className="btn md icon-only" type="button" aria-label="More ways to flash" aria-expanded={menu === "flash"} disabled={!!device.busy || !device.supported} onClick={() => setMenu(menu === "flash" ? null : "flash")}><Icon name="chevronDown" /></button>
              {menu === "flash" && (
                <span className="menu pop right" role="menu" onMouseLeave={() => setMenu(null)}>
                  {latest.sketch?.ok && latest.screen?.ok && <button className="item" type="button" role="menuitem" onClick={() => { setMenu(null); void flasher.flash(latest, "both"); }}>{latestOn ? "Flash again: sketch and screen" : "Sketch and screen"}</button>}
                  {latest.sketch?.ok && <button className="item" type="button" role="menuitem" onClick={() => { setMenu(null); void flasher.flash(latest, "sketch"); }}>Sketch only</button>}
                  {latest.screen?.ok && <button className="item" type="button" role="menuitem" onClick={() => { setMenu(null); void flasher.flash(latest, "screen"); }}>Screen only · about 95 s</button>}
                  <span className="sep" />
                  <button className="item" type="button" role="menuitem" onClick={() => { setMenu(null); onBuilds(); }}>All builds…</button>
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {!device.supported && device.insecure && (
        <div className="msg warn strip-msg" role="status">
          <span className="led" />
          <div className="body">
            <b>Flashing is off because this page was opened over plain HTTP.</b> Browsers only allow USB access on HTTPS or localhost.{" "}
            {config.publicUrl ? (
              <>Open <a href={`${config.publicUrl.replace(/\/$/, "")}${location.pathname}`}>{config.publicUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a> instead.</>
            ) : (
              <>Open the app at its HTTPS address instead.</>
            )}{" "}
            To keep using this address in Chrome, add <code className="code">{location.origin}</code> at <code className="code">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> and restart Chrome.
          </div>
        </div>
      )}
      {!device.supported && !device.insecure && (
        <div className="msg warn strip-msg" role="status"><span className="led" /><div className="body"><b>This browser can't reach USB devices.</b> Use Chrome or Edge on a computer to flash. Everything else works here.</div></div>
      )}
      {wrongBoard && (
        <div className="msg warn strip-msg" role="status">
          <span className="led" />
          <div className="body">
            <b>A {wrongBoard.name} is plugged in, but this project is for {meta.board.name}.</b> Flashing would fail or put the wrong sketch on it.
            <button className="btn" type="button" disabled={locked} onClick={() => void changeBoard(wrongBoard.id)}>Use {wrongBoard.name}</button>
          </div>
        </div>
      )}
      {wrongDisplay && (
        <div className="msg warn strip-msg" role="status">
          <span className="led" />
          <div className="body">
            <b>The display is a {wrongDisplay}, but this project is for {meta.display.model}.</b> A screen upload would be refused.
            {detectedDisplay && <button className="btn" type="button" disabled={locked} onClick={() => void changeDisplay(detectedDisplay.model)}>Use {detectedDisplay.model}</button>}
          </div>
        </div>
      )}
      {stale && !latestOn && flasher.running === null && (
        <div className="msg info strip-msg" role="status"><span className="led" /><div className="body">
            Build #{latest!.n} was made before the hardware changed: {stale}.
            <button className="btn" type="button" disabled={locked || rebuilding} onClick={() => void rebuild()}>{rebuilding ? "Rebuilding…" : "Rebuild"}</button>
          </div></div>
      )}
      {error && (
        <div className="msg bad strip-msg" role="alert"><span className="led" /><div className="body">{error}<button className="btn quiet" type="button" onClick={() => setError(null)}>Dismiss</button></div></div>
      )}
      {flasher.result && (
        <div className={`msg ${flasher.result.ok ? "ok" : "bad"} strip-msg`} role="status">
          <span className="led" />
          <div className="body">{flasher.result.text}<button className="btn quiet" type="button" onClick={flasher.clearResult}>Dismiss</button></div>
        </div>
      )}
    </div>
  );
}

/**
 * WebHID and drive access can only be granted from a click. When that couldn't happen inside the
 * Flash click, the flash waits here: a modal, because a corner toast was easy to miss while the board
 * sat in its bootloader.
 */
function BootloaderPrompt() {
  const device = useDevice();
  const prompt = device.bootloaderPrompt;
  // Once the .uf2 has been downloaded to copy by hand, the page must not write to the drive as well.
  const [byHand, setByHand] = useState(false);
  if (prompt?.kind === "rp2040" && byHand) {
    return (
      <div className="scrim">
        <div className="dialog app-dialog" role="alertdialog" aria-modal="true" aria-label="Copy the sketch by hand">
          <h2 className="h3">Copy the sketch by hand</h2>
          <div className="dialog-body">
            <p>Drag the downloaded .uf2 onto the RPI-RP2 drive. The board restarts by itself when the copy is complete, and this dialog closes then.</p>
            <p><b>Don't unplug the board or start anything else until it does.</b> If you ejected or unplugged it mid-copy, hold BOOT (BOOTSEL) while plugging it back in and copy the file again.</p>
          </div>
          <div className="actions end">
            <button className="btn md quiet" type="button" onClick={() => { setByHand(false); device.cancelBootloader(); }}>Cancel</button>
            <button className="btn md" type="button" onClick={() => { setByHand(false); device.copiedByHand(); }}>It restarted</button>
          </div>
        </div>
      </div>
    );
  }
  if (prompt?.kind === "rp2040") {
    return (
      <div className="scrim">
        <div className="dialog app-dialog" role="alertdialog" aria-modal="true" aria-label="Choose the RPI-RP2 drive">
          <h2 className="h3">Choose the RPI-RP2 drive</h2>
          <div className="dialog-body">
            <p>The board is in BOOTSEL mode and shows up as a USB drive called RPI-RP2. Chrome needs your OK before this page can copy the sketch onto it.</p>
            <p>Click <b>Choose drive and flash</b>, pick RPI-RP2, then allow Chrome to edit it. If the drive isn't there, give it a moment, or hold the BOOT (BOOTSEL) button while plugging the board in or pressing reset.</p>
            <p>Or <a href={prompt.fileUrl} download="sketch.uf2" onClick={() => setByHand(true)}>download the .uf2</a> and drag it onto RPI-RP2 yourself.</p>
          </div>
          <div className="actions end">
            <button className="btn md quiet" type="button" onClick={device.cancelBootloader}>Cancel</button>
            <button className="btn md primary" type="button" autoFocus onClick={() => void device.allowBootloader()}>
              <Icon name="zap" />
              Choose drive and flash
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="scrim">
      <div className="dialog app-dialog" role="alertdialog" aria-modal="true" aria-label="Allow the Teensy bootloader">
        <h2 className="h3">Allow the Teensy bootloader</h2>
        <div className="dialog-body">
          <p>The Teensy is in its bootloader (red LED) and waiting for the sketch. Chrome needs your OK once before this page can write to it.</p>
          <p>Click <b>Allow and flash</b>, then pick “Teensy HalfKay” in the list Chrome shows. If the list is empty, press the white button on the Teensy.</p>
        </div>
        <div className="actions end">
          <button className="btn md quiet" type="button" onClick={device.cancelBootloader}>Cancel</button>
          <button className="btn md primary" type="button" autoFocus onClick={() => void device.allowBootloader()}>
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
