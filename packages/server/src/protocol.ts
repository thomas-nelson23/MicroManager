/** WebSocket protocol between the server and the web UI (one socket per open project page). */

export type ChatEvent =
  | { kind: "user"; id: string; text: string; at: string; /** Project-relative paths of attached pictures. */ images?: string[] }
  | { kind: "text"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; label: string; detail?: string }
  | { kind: "tool_result"; id: string; ok: boolean; summary: string }
  | {
      kind: "flash";
      id: string;
      build: number;
      label: string;
      /** URLs (relative to the server) of the files to flash. */
      sketch?: string;
      screen?: string;
      screenBytes?: number;
      /** "pi": the server deploys it over SSH by itself; the page only shows how it went. */
      via?: "pi";
      status: "waiting" | "done" | "failed" | "skipped";
      message?: string;
    }
  | {
      kind: "turn_end";
      id: string;
      ok: boolean;
      error?: string;
      costUsd?: number;
      seconds?: number;
      /** Token use for the turn: fresh input, input read from the prompt cache, output, and the context size at the end. */
      tokens?: { input: number; cached: number; output: number; context: number; steps: number; model: string };
    }
  | { kind: "notice"; id: string; text: string };

export type ServerMessage =
  | { type: "hello"; events: ChatEvent[]; busy: boolean }
  | { type: "event"; event: ChatEvent }
  | { type: "update"; id: string; patch: Partial<ChatEvent> }
  | { type: "busy"; busy: boolean }
  | { type: "project_changed" }
  | {
      type: "device_request";
      id: string;
      /** Nextion instructions for the display; lines starting with "@" go to the sketch (NexPass.onRequest). */
      commands: string[];
      listenSeconds?: number;
    };

export type ClientMessage =
  | { type: "send"; text: string; /** Attached pictures as data URLs. */ images?: { name: string; dataUrl: string }[]; /** Use the stronger model for this message. */ strong?: boolean }
  | { type: "interrupt" }
  | { type: "flash_result"; id: string; status: "done" | "failed" | "skipped"; message?: string }
  | { type: "device_result"; id: string; ok: boolean; replies?: unknown[]; error?: string };
