/**
 * The device console: everything sent to and received from the display and the sketch, live while
 * "Keep connected" is on. Type a Nextion instruction, or "@request" to ask the sketch.
 */
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { NexReply } from "@nextion-arduino/flasher";
import { useDevice, type LogEntry } from "../device.tsx";
import { parseHmi } from "../hmi.ts";
import "./screen-tools.css";

function describe(r: NexReply, names: (page: number, id: number) => string | undefined): { text: string; cls: string } {
  if ("sketch" in r) return { text: `sketch: ${r.sketch}`, cls: "sketch" };
  if ("sketchDone" in r) return { text: "sketch: (end of answer)", cls: "note" };
  if ("touch" in r) {
    const n = names(r.touch.page, r.touch.component);
    return { text: `touch ${r.touch.event}: page ${r.touch.page}, component ${r.touch.component}${n ? ` (${n})` : ""}`, cls: "in" };
  }
  if ("string" in r) return { text: `"${r.string}"`, cls: "in" };
  if ("number" in r) return { text: String(r.number), cls: "in" };
  if ("page" in r) return { text: `page ${r.page}`, cls: "in" };
  if ("code" in r) return { text: `${r.code} ${r.meaning}`, cls: r.code === "0x1" ? "note" : "in" };
  return { text: r.raw, cls: "in" };
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour12: false });

export function DeviceConsole({ hmiText }: { hmiText: string }) {
  const device = useDevice();
  const [input, setInput] = useState("");
  const [hideOk, setHideOk] = useState(true);
  const list = useRef<HTMLOListElement>(null);
  const pages = useMemo(() => parseHmi(hmiText).pages, [hmiText]);
  const names = (page: number, id: number) => {
    const p = pages[page];
    if (!p) return undefined;
    return id === 0 ? p.name : p.objects[id - 1]?.name;
  };
  const shown = device.log.filter((e: LogEntry) => !(hideOk && e.reply && "code" in e.reply && e.reply.code === "0x1"));

  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    try {
      await device.run([text]);
    } catch {
      /* the error is in the log */
    }
  };

  return (
    <div className="console">
      <div className="console-bar">
        <button type="button" className={`btn ${device.live ? "checked" : ""}`} aria-pressed={device.live} disabled={!device.portLabel} onClick={() => device.setLive(!device.live)} title="Keep the port open and show what the display and the sketch send">
          {device.live ? "Connected" : "Keep connected"}
        </button>
        <label className="note"><input type="checkbox" checked={hideOk} onChange={(e) => setHideOk(e.target.checked)} /> hide "ok" replies</label>
        <span className="spacer" />
        <button type="button" className="btn quiet" onClick={device.clearLog} disabled={!device.log.length}>Clear</button>
      </div>
      <ol className="console-log" ref={list} aria-live="polite" aria-label="Device console">
        {shown.length === 0 && <li className="note">{device.portLabel ? "Nothing yet. Keep connected to watch touches and sketch messages." : "Choose the board's port to use the console."}</li>}
        {shown.map((e) => {
          const d = e.reply ? describe(e.reply, names) : { text: e.dir === "out" ? `> ${e.text}` : e.text ?? "", cls: e.dir === "out" ? "out" : "note" };
          return (
            <li key={e.n}>
              <span className="t">{time(e.at)}</span>
              <span className={d.cls}>{d.text}</span>
            </li>
          );
        })}
      </ol>
      <form className="console-form" onSubmit={submit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder='get t0.txt · page 1 · @request for the sketch' aria-label="Instruction to send" disabled={!device.portLabel} spellCheck={false} />
        <button type="submit" className="btn" disabled={!device.portLabel || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
