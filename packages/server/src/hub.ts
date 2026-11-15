/**
 * Per-project hub: the open browser tabs, the chat log, and requests that need the browser
 * (flashing and display commands go out over the user's USB through Web Serial).
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { WebSocket } from "ws";
import type { ChatEvent, ClientMessage, ServerMessage } from "./protocol.ts";
import { projectDir } from "./projects.ts";

type Pending = { resolve: (v: ClientMessage) => void; timer: NodeJS.Timeout };

export class ProjectHub {
  private sockets = new Set<WebSocket>();
  private pending = new Map<string, Pending>();
  private events: ChatEvent[] | null = null;
  busy = false;
  onClientMessage: (msg: ClientMessage) => void = () => {};

  constructor(readonly projectId: string) {}

  private get logFile() {
    return path.join(projectDir(this.projectId), ".chat.jsonl");
  }

  async load(): Promise<ChatEvent[]> {
    if (this.events) return this.events;
    const events: ChatEvent[] = [];
    try {
      for (const line of (await fs.readFile(this.logFile, "utf8")).split("\n")) {
        if (!line.trim()) continue;
        const rec = JSON.parse(line);
        if (rec.update) {
          const e = events.find((x) => x.id === rec.update);
          if (e) Object.assign(e, rec.patch);
        } else events.push(rec);
      }
    } catch {
      /* no log yet */
    }
    // a flash request left waiting by a restart can't complete any more
    for (const e of events) if (e.kind === "flash" && e.status === "waiting") Object.assign(e, { status: "skipped", message: "expired" });
    this.events = events;
    return events;
  }

  async addSocket(ws: WebSocket) {
    this.sockets.add(ws);
    ws.on("close", () => this.sockets.delete(ws));
    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if ((msg.type === "flash_result" || msg.type === "device_result") && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        p.resolve(msg);
        return;
      }
      this.onClientMessage(msg);
    });
    this.sendTo(ws, { type: "hello", events: await this.load(), busy: this.busy });
  }

  get connected() {
    return this.sockets.size > 0;
  }

  broadcast(msg: ServerMessage) {
    const s = JSON.stringify(msg);
    for (const ws of this.sockets) if (ws.readyState === ws.OPEN) ws.send(s);
  }

  private sendTo(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  async emit(event: ChatEvent) {
    (await this.load()).push(event);
    await fs.appendFile(this.logFile, JSON.stringify(event) + "\n");
    this.broadcast({ type: "event", event });
  }

  async update(id: string, patch: Partial<ChatEvent>) {
    const e = (await this.load()).find((x) => x.id === id);
    if (e) Object.assign(e, patch);
    await fs.appendFile(this.logFile, JSON.stringify({ update: id, patch }) + "\n");
    this.broadcast({ type: "update", id, patch });
  }

  setBusy(busy: boolean) {
    this.busy = busy;
    this.broadcast({ type: "busy", busy });
  }

  /** Wait for a browser to answer request `id` (sent separately), or time out. */
  waitFor(id: string, timeoutMs: number): Promise<ClientMessage | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
    });
  }
}

const hubs = new Map<string, ProjectHub>();
export function hubFor(projectId: string): ProjectHub {
  let h = hubs.get(projectId);
  if (!h) hubs.set(projectId, (h = new ProjectHub(projectId)));
  return h;
}
