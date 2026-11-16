# nextion-arduino

A self-hosted web app for building Arduino + Nextion projects by chatting with Claude, then flashing
the sketch and the screen from the browser to hardware on whichever computer you're using.
Design and decisions: [SPEC.md](SPEC.md).

## Packages

| package | what it is |
|---|---|
| `packages/server` | Node backend: projects on disk, Claude chat (Claude Agent SDK) with build/flash/display tools, sketch builds (arduino-cli) and screen builds (Nextion Editor on a Windows VM over SSH). |
| `packages/web` | React UI (Steeze design system): project list, and a project page with chat beside a workbench of tabs: Screen (preview), Wiring (board pinout with the project's connections and checks), Code and Builds. Flashing over Web Serial. |
| `packages/flasher` | Web Serial / WebHID / Node serial library: Nano Every flashing (jtag2updi), Teensy 4.1 flashing (HalfKay) and Nextion TFT upload. |
| `packages/flash-test` | Standalone page for testing the flasher against hardware. |
| `packages/server/template/sketch/NexPass.h` | The passthrough every sketch includes so the browser can reach the display through the running sketch. |

## Development

Needs Node 22+, `arduino-cli` with the boards you use (`arduino-cli core install arduino:megaavr`, and for
the Teensy 4.1 `arduino-cli core install teensy:avr --additional-urls https://www.pjrc.com/teensy/package_teensy_index.json`),
Python 3, OpenSSH, and a Claude Code login on this machine (or `CLAUDE_CODE_OAUTH_TOKEN`).

```bash
npm install
cp packages/server/.env.example packages/server/.env   # then set the VM details
npm run dev -w @nextion-arduino/server                 # API on :8765, projects in ./data
npm run dev -w @nextion-arduino/web                    # UI on http://localhost:5174
```

Flashing needs Chrome or Edge (Web Serial, plus WebHID for a Teensy) on `localhost` or HTTPS. A Teensy
is flashed through its HalfKay bootloader: the page reboots the running sketch into it (134-baud touch),
and the first time Chrome asks you to allow "Teensy HalfKay". A blank Teensy, or one whose sketch has
crashed, needs its button pressed. Every build's sketch can also be downloaded as a .hex for PJRC's Teensy Loader. On a plain-HTTP LAN address,
enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure` for that origin.

Each project keeps its wiring in `wiring.json` (board pin, part, part pin, wire colour); the Wiring tab draws it on
the board's pinout and checks it against the board and the sketch. Boards and their pins are in
`packages/server/src/boards.ts`, displays in `packages/server/src/displays.ts`.

Screen builds need the Windows VM's user signed in to the desktop (Nextion Editor runs in that session).
