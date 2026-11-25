# MicroManager

A self-hosted web app for building Arduino + Nextion projects by chatting with Claude, then flashing
the sketch and the screen from the browser to hardware on whichever computer you're using.
Design and decisions: [SPEC.md](SPEC.md).

Ideas and requests are welcome: use the app's **Feature requests** tab (it saves the request and can open it
as a GitHub issue here), or [open an issue](../../issues/new?template=feature_request.yml) directly.

## Packages

| package | what it is |
|---|---|
| `packages/server` | Node backend: projects on disk, Claude chat (Claude Agent SDK) with build/flash/display tools, sketch builds (arduino-cli) and screen builds (Nextion Editor on a Windows VM over SSH). |
| `packages/web` | React UI (Steeze design system): project list, a Feature requests tab, and a project page with chat beside a workbench of tabs: Screen (preview), Wiring (board pinout with the project's connections and checks), Code and Builds. Flashing over Web Serial. |
| `packages/flasher` | Web Serial / WebHID / Node serial library: Nano Every flashing (jtag2updi), Teensy 4.1 flashing (HalfKay), RP2040 UF2 checks and Nextion TFT upload. |
| `packages/flash-test` | Standalone page for testing the flasher against hardware. |
| `packages/server/template/sketch/NexPass.h` | The passthrough every sketch includes so the browser can reach the display through the running sketch. |

## Development

Needs Node 22+, `arduino-cli` with the boards you use (`arduino-cli core install arduino:megaavr`, and for
the Teensy 4.1 `arduino-cli core install teensy:avr --additional-urls https://www.pjrc.com/teensy/package_teensy_index.json`,
for the Raspberry Pi Pico `arduino-cli core install rp2040:rp2040 --additional-urls https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json`),
Python 3, OpenSSH, and either a Claude Code login on this machine (or `CLAUDE_CODE_OAUTH_TOKEN`) or a Hermes setup (below).

```bash
npm install
cp packages/server/.env.example packages/server/.env   # then set the VM details
npm run dev -w @micromanager/server                 # API on :8765, projects in ./data
npm run dev -w @micromanager/web                    # UI on http://localhost:5174
```

Flashing needs Chrome or Edge (Web Serial, plus WebHID for a Teensy) on `localhost` or HTTPS. A Teensy
is flashed through its HalfKay bootloader: the page reboots the running sketch into it (134-baud touch),
and the first time Chrome asks you to allow "Teensy HalfKay". A blank Teensy, or one whose sketch has
crashed, needs its button pressed. Every build's sketch can also be downloaded as a .hex for PJRC's Teensy Loader.

A Raspberry Pi Pico or Adafruit Feather RP2040 Prop-Maker is flashed by copying the build's .uf2 onto its BOOTSEL drive (RPI-RP2): the page
reboots the running sketch into BOOTSEL (1200-baud touch), and the first time per visit you pick the
RPI-RP2 drive in Chrome's folder picker and allow editing. A blank board, or one whose sketch has crashed,
needs BOOT (BOOTSEL) held while plugging it in or pressing reset. The flash dialog also offers the .uf2 to drag onto the drive by
hand. On Linux the drive has to be mounted (most desktops do that when it appears). On a plain-HTTP LAN address,
enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure` for that origin.

**Teensy on a Linux computer:** install PJRC's udev rules once, or Chrome can't open the Teensy
(its USB and bootloader devices are root-only by default, and ModemManager may grab its serial port):

```bash
curl -fsSLO https://www.pjrc.com/teensy/00-teensy.rules
sudo cp 00-teensy.rules /etc/udev/rules.d/ && sudo udevadm control --reload-rules && sudo udevadm trigger
```

Then replug the Teensy. Your user also needs serial access (`dialout`, or `uucp` on Arch-based systems).
A new Teensy runs a factory blink sketch with no serial port, so the port picker won't list it: flash it
once with the button method above (or Teensy Loader), and from then on the app's sketches keep USB serial.

Each project keeps its wiring in `wiring.json` (board pin, part, part pin, wire colour); the Wiring tab draws it on
the board's pinout and checks it against the board and the sketch. Boards and their pins are in
`packages/server/src/boards.ts`, displays in `packages/server/src/displays.ts`.

Screen builds need the Windows VM's user signed in to the desktop (Nextion Editor runs in that session).

## Chat: Claude or Hermes

The chat runs on Claude by default (Claude Agent SDK, `CLAUDE_CODE_OAUTH_TOKEN`). People without Claude can run it
on a [Hermes](https://nousresearch.com/) model from Nous Research instead, or on any other model, through an
OpenAI-compatible chat API. The app then runs its own small tool loop with the same tools Claude gets (Read, Edit,
Write, Glob, Grep, and the bench tools: ship, wire, check_screen, flash, display, component_info, install_library),
and keeps each project's conversation in `<project>/.chat-hermes.json`.

| Variable | Default | |
|---|---|---|
| `AI_PROVIDER` | unset | `claude` or `hermes`. Unset: Hermes when only Hermes settings are given, Claude otherwise. |
| `HERMES_BASE_URL` | `https://openrouter.ai/api/v1` | The API, up to and including `/v1`. |
| `HERMES_API_KEY` | | Sent as a bearer token. `OPENROUTER_API_KEY` works too. Not needed for a local server. |
| `HERMES_MODEL` | `nousresearch/hermes-4-70b` | Everyday chat turns, by the name the API uses. |
| `HERMES_STRONG_MODEL` | `nousresearch/hermes-4-405b` | A message sent with **Think harder**. |
| `HERMES_TIMEOUT` | `300` | Seconds to wait for one reply (local models on a CPU can be slow). |
| `HERMES_NAME` | `Hermes` | The assistant's name in the chat. |

Some setups:

- **OpenRouter** (pay per use): `HERMES_API_KEY=<key from openrouter.ai>`, nothing else.
- **Nous Portal**: `HERMES_BASE_URL=https://inference-api.nousresearch.com/v1`, `HERMES_API_KEY=<key>`,
  and `HERMES_MODEL` / `HERMES_STRONG_MODEL` set to model names as the portal lists them (e.g. `Hermes-4-70B`).
- **Ollama** on your own machine (free, needs a decent GPU): `ollama pull hermes3`, then
  `HERMES_BASE_URL=http://<ollama-host>:11434/v1`, `HERMES_MODEL=hermes3`. LM Studio, vLLM and llama.cpp's
  server work the same way with their own address and model name.

The model must support tool calling. When a server returns Hermes-style `<tool_call>` text instead of real tool
calls, the app reads those too. Smaller models make more mistakes with the screen format than Claude does, so
expect to point out more errors. Attached pictures are saved to the project, but the Hermes backend doesn't show
them to the model.
