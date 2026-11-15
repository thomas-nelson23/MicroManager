# nextion-arduino

A self-hosted web app for building Arduino + Nextion projects by chatting with Claude, then flashing
the sketch and the screen from the browser to hardware on whichever computer you're using.
Design and decisions: [SPEC.md](SPEC.md).

## Packages

| package | what it is |
|---|---|
| `packages/server` | Node backend: projects on disk, Claude chat (Claude Agent SDK) with build/flash/display tools, sketch builds (arduino-cli) and screen builds (Nextion Editor on a Windows VM over SSH). |
| `packages/web` | React UI (Steeze design system): project list, project page with chat, screen preview, flashing over Web Serial. |
| `packages/flasher` | Web Serial / Node serial library: Nano Every flashing (jtag2updi) and Nextion TFT upload. |
| `packages/flash-test` | Standalone page for testing the flasher against hardware. |
| `packages/server/template/sketch/NexPass.h` | The passthrough every sketch includes so the browser can reach the display through the running sketch. |

## Development

Needs Node 22+, `arduino-cli` with the boards you use (`arduino-cli core install arduino:megaavr`),
Python 3, OpenSSH, and a Claude Code login on this machine (or `CLAUDE_CODE_OAUTH_TOKEN`).

```bash
npm install
cp packages/server/.env.example packages/server/.env   # then set the VM details
npm run dev -w @nextion-arduino/server                 # API on :8765, projects in ./data
npm run dev -w @nextion-arduino/web                    # UI on http://localhost:5174
```

Flashing needs Chrome or Edge (Web Serial) on `localhost` or HTTPS. On a plain-HTTP LAN address,
enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure` for that origin.

Screen builds need the Windows VM's user signed in to the desktop (Nextion Editor runs in that session).
