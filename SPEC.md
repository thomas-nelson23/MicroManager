# nextion-arduino: spec

A self-hosted web app, running as one Docker container on Unraid. You create Arduino + Nextion projects by
chatting with Claude Code built into the container, preview the screen, and flash both the Arduino sketch
and the Nextion TFT **from your browser** to hardware plugged into whatever PC you are using.

Decisions below were agreed on 2026-11-15. Anything marked *later* is out of scope for v1.

## 1. Architecture

```
 Browser (any PC on the LAN, Chrome/Edge)            Unraid
 ├─ web UI  <──── HTTP + WebSocket ────────────────> nextion-arduino container
 │   ├─ chat with Claude                              ├─ Node backend + Claude Agent SDK
 │   ├─ files / Nextion preview                       ├─ arduino-cli + AVR cores
 │   └─ flash panel (Web Serial)                      ├─ /data (appdata): projects, builds, ~/.claude
 └─ USB ── Arduino (sketch + passthrough lib)         └─ ssh ──> Windows VM: Nextion Editor (compiles TFT)
              └─ Serial1 ── Nextion display
```

- Nothing depends on RadioShack. Testing happens there first in Docker (`http://localhost:8765`).
- The Windows VM (already on Unraid) stays the Nextion compiler: Nextion Editor's hidden automation mode,
  driven over SSH and an interactive scheduled task. The VM user signs in to the desktop manually; the
  server reports a clear error when nobody is signed in.

## 2. Container

- **Stack:** TypeScript. Node backend using the Claude Agent SDK, React frontend (Vite), one image.
- **Claude auth:** subscription token `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`), passed as a
  container secret. The owner has accepted responsibility for checking that this fits Anthropic's terms.
- **Permissions:** Claude edits files and runs builds inside the project folder without asking. Flashing
  always waits for the user's click in the browser.
- **Tools given to Claude** (in-process MCP tools from the SDK):
  - `nextion_validate`, `nextion_build`: check `hmi.txt`, then compile on the VM and return the result
  - `sketch_build`: arduino-cli compile for the project's board, always linking the passthrough library
  - `preview_render`: render `hmi.txt` to a PNG Claude can look at
  - `request_flash`: ask the UI to flash the sketch and/or the TFT. It shows a Flash button, waits, and
    returns the outcome.
  - `device_command`: send a Nextion instruction (`get t0.txt`, `page 1`, …) through the user's browser
    and the passthrough, and return the decoded reply. Also used to listen for touch events.
- **Reference material for Claude:** the existing `nextion` skill (hmi.txt format, components.json with
  51 components and 686 attributes, event-code rules, gotchas) becomes a skill or system prompt inside the
  container.
- **Config:** environment variables, e.g. VM host/user, VM job root, editor path, default display model.
  The SSH key for the VM is in a mounted secret.
- **Updates:** GitHub Actions builds `ghcr.io/thomas-nelson23/nextion-arduino` on every push to `main`. The
  repo is private, so Unraid pulls with a read-only package token. Install uses an Unraid Docker template.

## 3. Projects

Plain folders in appdata, `/data/projects/<name>/`:

```
sketch/<name>.ino (+ .h/.cpp)    the Arduino project, written by Claude
nextion/hmi.txt, star.txt         the screen as automation JSON + Program.s
nextion/font/, nextion/img/       fonts (.zi) and pictures, numeric order
hardware.md                       board, wiring, pins, parts; Claude reads and updates it
project.json                      board FQBN, display series/model/size, serial settings
builds/<n>/                       numbered snapshots: sketch .hex, .tft, .HMI, logs, the sources used
```

- **Boards (v1):** Nano Every, Uno, classic Nano, Mega 2560, Leonardo, Micro.
  - Nano Every, Mega, Leonardo and Micro talk to the display on a spare hardware serial port (Serial1).
  - Uno and classic Nano have to use SoftwareSerial for the display. Their uploads are slower (about
    38400 baud) and less reliable, and the UI warns about this.
- **Displays:** any Nextion model, chosen per project. The default is Intelligent `NX4827P043_011`
  (480x272). Uploading refuses a display that reports a different model.

## 4. Passthrough library (`NexPass`)

Every built sketch includes it. The user's code calls `NexPass.begin(Serial1)` and `NexPass.poll()`.

- Normally it does nothing visible. The sketch owns the display and can also use USB Serial for itself.
- When the host sends the Nextion upload start (`whmi-wri size,baud,0`, preceded by `connect`) on USB, the
  library takes over. It bridges USB and the display byte for byte, follows the baud change, and when the
  transfer ends it resets the board so the sketch starts fresh.
- It also bridges ordinary instructions on request, which `device_command` uses for read-back.
- Constraint for sketches: `loop()` must not block for long. This goes in Claude's rules.

## 5. Web UI

- **Projects page:** list projects, create one (name, board, display).
- **Project page:**
  - chat: streamed replies, tool calls, file diffs
  - files: tree and read-only viewer
  - preview: hmi.txt on a canvas at the display's resolution, clickable pages; approximate fonts and pictures
  - flash panel: connect a port, flash the sketch, upload the TFT, serial console
- **Flashing from the browser (Web Serial):** JavaScript implementations of
  - Nano Every: jtag2updi through the on-board USB bridge (1200-baud touch, then the JTAGICE mkII protocol)
  - Uno, classic Nano: STK500v1 (Optiboot; the old bootloader at 57600)
  - Mega 2560: STK500v2
  - Leonardo, Micro: AVR109 (Caterina; 1200-baud touch, then the board reappears as a new port that the
    user may have to pick again)
  - Nextion TFT: upload protocol v1.1 through NexPass
- **Access:** plain HTTP on the LAN with no login for now. Web Serial only works on secure pages, so:
  - localhost works as is
  - for `http://<unraid-ip>:8765`, enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure` once
    per browser
  - *later:* HTTPS through the existing Cloudflare tunnel with Cloudflare Access, or LAN HTTPS

## 6. Build order

1. **Browser flashing test:** a standalone test page on localhost that flashes the Nano Every and uploads
   a TFT, checked against the real hardware on RadioShack. This is the riskiest part, so it goes first.
2. NexPass library, plus TFT upload through a running sketch.
3. Backend: projects, Agent SDK chat, the VM build service, arduino-cli builds.
4. Web UI: chat, files, preview, flash panel; then the other board protocols.
5. Dockerfile, GHCR workflow, Unraid template.
6. A handoff document for the LLM that has SSH access to Unraid, which does the permanent setup.

## 7. Known limits carried over

- Nextion Editor doesn't expose compiler messages in automation mode. A failed build leaves only the
  .HMI, which can be opened in the editor to see the error.
- Each Nextion build creates a new project from the JSON. Existing .HMI files can't be edited.
- `hmi.txt` and the Program.s rules are documented in the existing skill (`~/.claude/skills/nextion`),
  which gets copied into this repo.
