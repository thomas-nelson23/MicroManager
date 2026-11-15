/** The conversation with Claude: messages, tool steps, flash requests, and the message box. */
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import type { ChatEvent } from "@nextion-arduino/server/protocol";
import { useDevice } from "../device.tsx";
import type { ProjectState } from "../useProject.ts";
import { Icon } from "./Icon.tsx";

type ToolEv = Extract<ChatEvent, { kind: "tool" }>;
type ResultEv = Extract<ChatEvent, { kind: "tool_result" }>;
type FlashEv = Extract<ChatEvent, { kind: "flash" }>;

/** Inline formatting: `code` and **bold**. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, k) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
          <code key={k} className="code">{part.slice(1, -1)}</code>
        ) : part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <b key={k}>{part.slice(2, -2)}</b>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Minimal markdown: paragraphs, line breaks, "- " / "1. " lists, `code`, **bold**. */
function Rich({ text }: { text: string }) {
  const paras = text.trim().split(/\n{2,}/);
  return (
    <>
      {paras.map((p, i) => {
        const lines = p.split("\n");
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]!);
          const items = lines.map((l, j) => <li key={j}><Inline text={l.replace(/^\s*([-*]|\d+\.)\s+/, "")} /></li>);
          return ordered ? <ol key={i} className="chat-ul">{items}</ol> : <ul key={i} className="chat-ul">{items}</ul>;
        }
        return (
          <p key={i} className="chat-p">
            {lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

function ToolRows({ tools, results }: { tools: ToolEv[]; results: Map<string, ResultEv> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="tool-rows">
      {tools.map((t) => {
        const r = results.get(t.id);
        const state = !r ? "pending" : r.ok ? "ok" : "bad";
        return (
          <Fragment key={t.id}>
            <button type="button" className={`tool-row ${state}`} onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id} disabled={!r}>
              <span className="tool-mark" aria-label={state === "pending" ? "running" : state === "ok" ? "done" : "failed"}>
                {state === "ok" ? <Icon name="check" /> : state === "bad" ? <Icon name="x" /> : <i className="tool-dot" />}
              </span>
              <span className="tool-label">{t.label}</span>
              <span className="tool-detail">{t.detail}</span>
            </button>
            {open === t.id && r?.summary && <pre className="tool-output">{r.summary}</pre>}
          </Fragment>
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
    if (!device.portLabel && !(await device.choosePort())) return;
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
              {device.portLabel ? `Flash ${parts}` : "Choose port and flash"}
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

export function ChatPanel({ project }: { project: ProjectState }) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const { events, busy } = project;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length, busy]);

  const results = new Map<string, ResultEv>();
  for (const e of events) if (e.kind === "tool_result") results.set(e.id.replace(/:result$/, ""), e);

  // group consecutive tool events into one block
  const blocks: ReactNode[] = [];
  let toolRun: ToolEv[] = [];
  const flushTools = (key: string) => {
    if (toolRun.length) blocks.push(<ToolRows key={`tools-${key}`} tools={toolRun} results={results} />);
    toolRun = [];
  };
  for (const e of events) {
    if (e.kind === "tool") {
      toolRun.push(e);
      continue;
    }
    if (e.kind === "tool_result") continue;
    flushTools(e.id);
    if (e.kind === "user") blocks.push(<div key={e.id} className="chat-user">{e.text}</div>);
    else if (e.kind === "text") blocks.push(<div key={e.id} className="chat-claude"><Rich text={e.text} /></div>);
    else if (e.kind === "flash") blocks.push(<FlashCard key={e.id} ev={e} project={project} />);
    else if (e.kind === "turn_end")
      blocks.push(
        <div key={e.id} className={`chat-end ${e.ok ? "" : "bad"}`}>
          {e.ok ? "Done" : e.error === "Stopped." ? "Stopped" : `Stopped with an error: ${e.error}`}
          {e.seconds !== undefined && ` · ${e.seconds} s`}
          {e.costUsd !== undefined && e.costUsd > 0 && ` · $${e.costUsd.toFixed(2)}`}
        </div>,
      );
    else if (e.kind === "notice") blocks.push(<div key={e.id} className="chat-end">{e.text}</div>);
  }
  flushTools("tail");

  const submit = () => {
    const t = draft.trim();
    if (!t || busy) return;
    project.sendText(t);
    setDraft("");
  };

  return (
    <section className="chat" aria-label="Chat with Claude">
      <div className="chat-bar">
        <span className="eyebrow">Chat · Claude Code</span>
        <span className="chat-bar-status">{!project.connected ? "reconnecting…" : busy ? "working…" : "works in this project's folder"}</span>
      </div>
      <div className="chat-scroll" ref={scroller}>
        {events.length === 0 && (
          <div className="empty">
            <span className="h4">Describe what you're building</span>
            <span>For example: "A greenhouse monitor: DHT22 on D2, fan relay on D4. Show temperature and humidity on the display, with a button to override the fan."</span>
          </div>
        )}
        {blocks}
        {busy && (
          <div className="chat-working">
            <div className="progress"><div className="bar busy"><i /></div></div>
            <button className="btn quiet" type="button" onClick={project.interrupt}>Stop</button>
          </div>
        )}
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-msg" className="eyebrow">Message</label>
        <div className="chat-compose-row">
          <textarea
            id="chat-msg"
            rows={2}
            value={draft}
            placeholder="Describe a change to the sketch or the screen…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className="btn md primary" type="submit" disabled={busy || !draft.trim()}>Send</button>
        </div>
      </form>
    </section>
  );
}
