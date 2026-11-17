/** One project's live state: details over REST, chat events and device requests over a WebSocket. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEvent, ClientMessage, ServerMessage } from "@nextion-arduino/server/protocol";
import { api, type ProjectDetail } from "./api.ts";
import { useDevice } from "./device.tsx";

export function useProject(id: string) {
  const device = useDevice();
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  const reload = useCallback(() => {
    api.project(id).then(setDetail, (e: Error) => setError(e.message));
  }, [id]);

  const send = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return false;
    ws.current.send(JSON.stringify(msg));
    return true;
  }, []);

  useEffect(() => {
    reload();
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/projects/${id}/ws`);
      ws.current = sock;
      sock.onopen = () => setConnected(true);
      sock.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
      sock.onmessage = async (e) => {
        const msg = JSON.parse(e.data) as ServerMessage;
        switch (msg.type) {
          case "hello":
            setEvents(msg.events);
            setBusy(msg.busy);
            break;
          case "event":
            setEvents((ev) => [...ev, msg.event]);
            break;
          case "update":
            setEvents((ev) => ev.map((x) => (x.id === msg.id ? ({ ...x, ...msg.patch } as ChatEvent) : x)));
            break;
          case "busy":
            setBusy(msg.busy);
            break;
          case "project_changed":
            reload();
            break;
          case "device_request": {
            const dev = deviceRef.current;
            if (!dev.portLabel) {
              send({ type: "device_result", id: msg.id, ok: false, error: "No device is connected in the browser. Ask the person to choose the Arduino's port." });
              break;
            }
            try {
              const r = await dev.run(msg.commands, msg.listenSeconds);
              send({ type: "device_result", id: msg.id, ok: true, replies: [...r.results, ...(r.events.length ? [{ events: r.events }] : [])] });
            } catch (err) {
              send({ type: "device_result", id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
            }
            break;
          }
        }
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws.current?.close();
    };
  }, [id, reload, send]);

  return {
    id,
    detail,
    error,
    events,
    busy,
    connected,
    reload,
    /** False when the message could not be sent (no connection): keep the draft. */
    sendText: (text: string, images?: { name: string; dataUrl: string }[], strong?: boolean) => send({ type: "send", text, ...(images?.length ? { images } : {}), ...(strong ? { strong } : {}) }),
    interrupt: () => send({ type: "interrupt" }),
    flashResult: (eventId: string, status: "done" | "failed" | "skipped", message?: string) => send({ type: "flash_result", id: eventId, status, message }),
  };
}

export type ProjectState = ReturnType<typeof useProject>;
