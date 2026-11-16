/** The conversation with Claude: messages, tool steps, flash requests, and the message box. */
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatEvent } from "@nextion-arduino/server/protocol";
import { api } from "../api.ts";
import { useDevice } from "../device.tsx";
import type { ProjectState } from "../useProject.ts";
import { Icon } from "./Icon.tsx";
import { Markdown } from "./Markdown.tsx";

type ToolEv = Extract<ChatEvent, { kind: "tool" }>;
type ResultEv = Extract<ChatEvent, { kind: "tool_result" }>;
type FlashEv = Extract<ChatEvent, { kind: "flash" }>;
type Picture = { name: string; dataUrl: string };

function ToolRows({ tools, results }: { tools: ToolEv[]; results: Map<string, ResultEv> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="tool-rows">
      {tools.map((t) => {
        const r = results.get(t.id);
        const state = !r ? "pending" : r.ok ? "ok" : "bad";
        return (
          <div key={t.id} className="tool-item">
            <button type="button" className={`tool-row ${state}`} onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id} disabled={!r}>
              <span className="tool-mark" aria-label={state === "pending" ? "running" : state === "ok" ? "done" : "failed"}>
                {state === "ok" ? <Icon name="check" /> : state === "bad" ? <Icon name="x" /> : <i className="tool-dot" />}
              </span>
              <span className="tool-label">{t.label}</span>
              <span className="tool-detail">{t.detail}</span>
            </button>
            {open === t.id && r?.summary && <pre className="tool-output">{r.summary}</pre>}
          </div>
        );
      })}
    </div>
  );
}

function FlashCard({ ev, project }: { ev: FlashEv; project: ProjectState }) {
  const device = useDevice();
  const [running, setRunning] = useState(false);
  const parts = [ev.sketch && "sketch", ev.screen && "screen"].filter(Boolean).join(" and ");
  const flash = async () => {
    if (!(await device.ensurePort())) return;
    setRunning(true);
    const r = await device.flash({ sketchUrl: ev.sketch, screenUrl: ev.screen, expectModel: project.detail?.meta.display.model });
    setRunning(false);
    project.flashResult(ev.id, r.status, r.message);
  };
  const waiting = ev.status === "waiting";
  const pct = device.busy?.total ? Math.round(((device.busy.done ?? 0) * 100) / device.busy.total) : undefined;
  return (
    <div className={`flash-card ${waiting ? "live" : ""}`}>
      <div className="flash-head">
        <div className="flash-text">
          <span className="flash-title">{waiting ? `Build #${ev.build} is ready to flash` : ev.status === "done" ? `Flashed build #${ev.build}` : ev.status === "failed" ? `Flashing build #${ev.build} failed` : `Skipped build #${ev.build}`}</span>
          <span className="flash-sub">
            {waiting ? `${ev.label} · ${parts}${ev.screen ? " · the screen takes about 95 s" : ""}` : ev.message}
          </span>
        </div>
        {waiting && !running && (
          <>
            <button className="btn md quiet" type="button" onClick={() => project.flashResult(ev.id, "skipped", "skipped by the person")}>Skip</button>
            <button className="btn md primary" type="button" onClick={flash}>
              <Icon name="zap" />
              {device.portLabel || device.board === "teensy" ? `Flash ${parts}` : "Choose port and flash"}
            </button>
          </>
        )}
      </div>
      {running && device.busy && (
        <div className="progress">
          <div className="row">
            <b>{device.busy.label}</b>
            {pct !== undefined && <span className="num">{pct} %</span>}
          </div>
          <div className={`bar ${pct === undefined ? "busy" : ""}`}><i style={{ width: pct === undefined ? undefined : `${pct}%` }} /></div>
        </div>
      )}
    </div>
  );
}

const clock = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`);

/** Seconds since `since`, ticking while `on`. */
function useElapsed(since: string | undefined, on: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on, since]);
  return since ? Math.max(0, Math.round((now - Date.parse(since)) / 1000)) : 0;
}

/** Shrink a picture to at most 1600 px on its long side and return it as a JPEG data URL. */
async function shrink(file: File): Promise<Picture | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return { name: file.name || "picture.jpg", dataUrl: canvas.toDataURL("image/jpeg", 0.85) };
  } catch {
    return null;
  }
}

interface Props {
  project: ProjectState;
  draft: string;
  setDraft: (v: string | ((d: string) => string)) => void;
  /** Bumped when something outside the chat puts text in the box, to move focus there. */
  focusKey: number;
  onCollapse?: () => void;
}

export function ChatPanel({ project, draft, setDraft, focusKey, onCollapse }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { events, busy, connected } = project;
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(false);
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [queued, setQueued] = useState<{ text: string; pictures: Picture[] } | null>(null);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Follow the conversation only while the person is at the bottom of it.
  const toBottom = useCallback(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    setUnseen(false);
  }, []);
  useLayoutEffect(() => {
    if (atBottom) toBottom();
    else setUnseen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length, busy]);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAtBottom(bottom);
    if (bottom) setUnseen(false);
  };

  // The box grows with its text, up to a third of the window.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, Math.round(window.innerHeight / 3))}px`;
  }, [draft]);
  useEffect(() => {
    if (focusKey) box.current?.focus();
  }, [focusKey]);

  // A follow-up typed while Claude works goes out when the turn ends.
  useEffect(() => {
    if (!queued || busy || !connected) return;
    if (project.sendText(queued.text, queued.pictures)) setQueued(null);
  }, [queued, busy, connected, project]);

  const results = new Map<string, ResultEv>();
  for (const e of events) if (e.kind === "tool_result") results.set(e.id.replace(/:result$/, ""), e);

  // group consecutive tool events into one block
  const blocks: ReactNode[] = [];
  let toolRun: ToolEv[] = [];
  let lastUserAt: string | undefined;
  let pending: ToolEv | undefined;
  const flushTools = (key: string) => {
    if (toolRun.length) blocks.push(<ToolRows key={`tools-${key}`} tools={toolRun} results={results} />);
    toolRun = [];
  };
  for (const e of events) {
    if (e.kind === "tool") {
      toolRun.push(e);
      if (!results.has(e.id)) pending = e;
      continue;
    }
    if (e.kind === "tool_result") continue;
    flushTools(e.id);
    if (e.kind === "user") {
      lastUserAt = e.at;
      pending = undefined;
      blocks.push(
        <div key={e.id} className="chat-user">
          {e.images?.length ? (
            <div className="chat-pics">
              {e.images.map((p) => (
                <a key={p} href={api.uploadUrl(project.id, p)} target="_blank" rel="noreferrer"><img src={api.uploadUrl(project.id, p)} alt="Attached picture" /></a>
              ))}
            </div>
          ) : null}
          {e.text}
        </div>,
      );
    } else if (e.kind === "text") blocks.push(<div key={e.id} className="chat-claude"><Markdown text={e.text} /></div>);
    else if (e.kind === "flash") blocks.push(<FlashCard key={e.id} ev={e} project={project} />);
    else if (e.kind === "turn_end")
      blocks.push(
        <div key={e.id} className={`chat-end ${e.ok ? "" : "bad"}`}>
          {e.ok ? "Done" : e.error === "Stopped." ? "Stopped" : `Stopped with an error: ${e.error}`}
          {e.seconds !== undefined && ` · ${clock(e.seconds)}`}
          {e.costUsd !== undefined && e.costUsd > 0 && ` · $${e.costUsd.toFixed(2)}`}
        </div>,
      );
    else if (e.kind === "notice") blocks.push(<div key={e.id} className="chat-end">{e.text}</div>);
  }
  flushTools("tail");
  const elapsed = useElapsed(lastUserAt, busy);
  const step = pending && !results.has(pending.id) ? `${pending.label.toLowerCase()} ${pending.detail ?? ""}`.trim() : "thinking";

  const addFiles = async (files: Iterable<File>) => {
    const next: Picture[] = [];
    for (const f of files) {
      const p = await shrink(f);
      if (p) next.push(p);
    }
    if (next.length) setPictures((cur) => [...cur, ...next].slice(0, 4));
  };

  const submit = () => {
    const text = draft.trim();
    if (!text && !pictures.length) return;
    if (busy) {
      if (queued) return;
      setQueued({ text, pictures });
    } else if (!project.sendText(text, pictures)) {
      setNotice("Not sent: the connection to the server is down. Your message is still in the box.");
      return;
    }
    setNotice(null);
    setDraft("");
    setPictures([]);
    setAtBottom(true);
    requestAnimationFrame(toBottom);
  };

  const fresh = async () => {
    setMenu(false);
    try {
      await api.newConversation(project.id);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const canSend = connected && (!!draft.trim() || pictures.length > 0) && !(busy && queued);
  return (
    <section className="chat" aria-label="Chat with Claude">
      <div className="chat-bar">
        <span className="eyebrow">Chat</span>
        <span className={`chat-bar-status ${connected ? "" : "bad"}`}>{!connected ? "reconnecting…" : busy ? `working · ${clock(elapsed)}` : ""}</span>
        <span className="spacer" />
        <div className="pop-anchor">
          <button className="btn quiet icon-only" type="button" aria-label="Conversation menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="more" /></button>
          {menu && (
            <div className="menu pop right" role="menu" onMouseLeave={() => setMenu(false)}>
              <button className="item" type="button" role="menuitem" disabled={busy || events.length === 0} onClick={fresh}>New conversation</button>
              <span className="menu-help">Clears the chat. Claude starts fresh but the project's files stay.</span>
            </div>
          )}
        </div>
        {onCollapse && <button className="btn quiet icon-only" type="button" aria-label="Hide the chat" onClick={onCollapse}><Icon name="chevronLeft" /></button>}
      </div>
      {!connected && (
        <div className="msg bad chat-banner" role="status"><span className="led" /><div className="body"><b>Connection lost.</b> Reconnecting. Messages can't be sent until it's back.</div></div>
      )}
      <div className="chat-scroll-wrap">
        <div className="chat-scroll" ref={scroller} onScroll={onScroll}>
          {events.length === 0 && (
            <div className="empty">
              <span className="h4">Describe what you're building</span>
              <span>For example: "A greenhouse monitor: DHT22 on D2, fan relay on D4. Show temperature and humidity on the display, with a button to override the fan."</span>
            </div>
          )}
          {blocks}
          {busy && (
            <div className="chat-working" role="status">
              <div className="chat-working-text">
                <b>{clock(elapsed)}</b>
                <span>{step}</span>
              </div>
              <div className="progress"><div className="bar busy"><i /></div></div>
              <button className="btn md quiet" type="button" onClick={project.interrupt}><Icon name="x" />Stop</button>
            </div>
          )}
        </div>
        {unseen && !atBottom && (
          <button className="btn md jump" type="button" onClick={() => { setAtBottom(true); toBottom(); }}>
            <Icon name="chevronDown" />Jump to latest
          </button>
        )}
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {notice && <div className="chat-notice" role="alert">{notice}</div>}
        {queued && (
          <div className="chat-queued">
            <span className="eyebrow">Queued</span>
            <span className="chat-queued-text">{queued.text || `${queued.pictures.length} picture${queued.pictures.length > 1 ? "s" : ""}`}</span>
            <button
              className="btn quiet"
              type="button"
              onClick={() => {
                setDraft((d) => d || queued.text);
                setPictures((p) => (p.length ? p : queued.pictures));
                setQueued(null);
              }}
            >
              Edit
            </button>
          </div>
        )}
        {pictures.length > 0 && (
          <div className="chat-pics">
            {pictures.map((p, i) => (
              <span key={i} className="chat-pic">
                <img src={p.dataUrl} alt={p.name} />
                <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPictures((cur) => cur.filter((_, j) => j !== i))}><Icon name="x" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="chat-compose-row">
          <textarea
            ref={box}
            id="chat-msg"
            aria-label="Message"
            rows={2}
            value={draft}
            placeholder={busy ? "Type a follow-up. It's sent when Claude finishes…" : "Describe a change to the sketch, the screen or the wiring…"}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.some((f) => f.type.startsWith("image/"))) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="chat-compose-btns">
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
            <button className="btn md quiet icon-only" type="button" aria-label="Attach a picture" title="Attach a picture, for example a photo of the wiring" onClick={() => fileInput.current?.click()}><Icon name="image" /></button>
            <button className="btn md primary" type="submit" disabled={!canSend}>{busy ? "Queue" : "Send"}</button>
          </div>
        </div>
      </form>
    </section>
  );
}
