# Development

Design and decisions: [SPEC.md](../SPEC.md).

## Packages

| package | what it is |
|---|---|
| `packages/server` | Node backend: projects on disk, the chat (Claude Agent SDK) with build/flash/display tools, sketch builds (arduino-cli) and screen builds (Nextion Editor on a Windows VM over SSH). |
| `packages/web` | React UI (Steeze design system): project list, a Feature requests tab, and a project page with chat beside a workbench of tabs: Screen (preview), Wiring (board pinout with the project's connections and checks), Code and Builds. Flashing over Web Serial. |
| `packages/flasher` | Web Serial / WebHID / Node serial library: Nano Every flashing (jtag2updi), Teensy 4.1 flashing (HalfKay), RP2040 UF2 checks and Nextion TFT upload. |
| `packages/flash-test` | Standalone page for testing the flasher against hardware. |
| `packages/server/template/sketch/NexPass.h` | The passthrough every sketch includes so the browser can reach the display through the running sketch. |

Each project keeps its wiring in `wiring.json` (board pin, part, part pin, wire colour); the Wiring tab draws it on
the board's pinout and checks it against the board and the sketch. Boards and their pins are in
`packages/server/src/boards.ts`, displays in `packages/server/src/displays.ts`.

## Running it from source

Needs Node 22+, `arduino-cli` with the boards you use, Python 3, OpenSSH, and a Claude Code login on this
machine (or `CLAUDE_CODE_OAUTH_TOKEN`).

```bash
arduino-cli core install arduino:megaavr
# Teensy 4.1
arduino-cli core install teensy:avr --additional-urls https://www.pjrc.com/teensy/package_teensy_index.json
# Raspberry Pi Pico / RP2040
arduino-cli core install rp2040:rp2040 --additional-urls https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
```

```bash
npm install
cp packages/server/.env.example packages/server/.env   # then set the VM details
npm run dev -w @micromanager/server                    # API on :8765, projects in ./data
npm run dev -w @micromanager/web                       # UI on http://localhost:5174
```

`npm test` and `npm run typecheck` run across all packages.

Screen builds need the Windows VM's user signed in to the desktop (Nextion Editor runs in that session).
Flashing notes per board are in [FLASHING.md](FLASHING.md).
