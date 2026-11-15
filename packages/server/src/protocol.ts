/** WebSocket protocol between the server and the web UI (one socket per open project page). */

export type ChatEvent =
  | { kind: "user"; id: string; text: string; at: string }
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
      status: "waiting" | "done" | "failed" | "skipped";
      message?: string;
    }
  | { kind: "turn_end"; id: string; ok: boolean; error?: string; costUsd?: number; seconds?: number }
  | { kind: "notice"; id: string; text: string };

export type ServerMessage =
  | { type: "hello"; events: ChatEvent[]; busy: boolean }
  | { type: "event"; event: ChatEvent }
  | { type: "update"; id: string; patch: Partial<ChatEvent> }
  | { type: "busy"; busy: boolean }
  | { type: "project_changed" }
  | { type: "device_request"; id: string; commands: string[]; listenSeconds?: number };

export type ClientMessage =
  | { type: "send"; text: string }
  | { type: "interrupt" }
  | { type: "flash_result"; id: string; status: "done" | "failed" | "skipped"; message?: string }
  | { type: "device_result"; id: string; ok: boolean; replies?: unknown[]; error?: string };
