# Installing nextion-arduino on Unraid

**Audience:** the AI (or person) that manages the Unraid server. You have shell access to Unraid. You
don't need this repository's code: the server runs a published Docker image.

**What it is:** a web app (one container) where the owner creates Arduino + Nextion display projects by
chatting with Claude. Claude edits the project files in the container. The container compiles sketches
with arduino-cli, and compiles screens by driving Nextion Editor on a Windows VM over SSH. Flashing
happens in the owner's browser (Web Serial) on whatever computer the hardware is plugged into. The
container never touches USB.

```
 Owner's browser (Chrome/Edge) ──HTTP──> nextion-arduino container (Unraid, port 8765)
   └─ USB: Arduino + Nextion                ├─ /data  (appdata: projects, chat, Claude sessions, SSH key)
                                            └─ ssh ──> Windows VM 10.1.1.62 (Nextion Editor, user "monta")
```

## Facts

| | |
|---|---|
| Image | `ghcr.io/thomas-nelson23/nextion-arduino:latest`, **private** (needs a registry login) |
| Built by | GitHub Actions on every push to `main` of `thomas-nelson23/nextion-arduino` |
| Port | `8765/tcp` (web UI + API + WebSocket) |
| Volume | `/data` → `/mnt/user/appdata/nextion-arduino` |
| Unraid template | `unraid/nextion-arduino.xml` in the repo (contents also below) |
| Health | `GET http://<unraid>:8765/api/health` returns `{"ok":true}` |
| Runs as | root inside the container (the same as most Unraid containers); no privileged mode, no devices |

| Variable | Required | Value |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | yes | The owner makes it with `claude setup-token` on their PC (valid for 1 year). Secret: never log it, commit it or paste it into chat history you keep. |
| `VM_HOST` | yes | `monta@10.1.1.62` |
| `VM_USER` | yes | `monta` |
| `VM_JOBROOT` | yes | `C:\Users\monta\nxauto` |
| `VM_EDITOR` | no | `C:\Program Files (x86)\Nextion Editor\Nextion Editor.exe` (default) |
| `DISPLAY_SERIES` / `DISPLAY_MODEL` | no | `Intelligent` / `NX4827P043_011` (defaults for new projects) |
| `CLAUDE_MODEL` | no | `claude-opus-5-5` (default) |

## Before you start: what to get from the owner

1. **Confirmation that the image exists.** The PR that adds the Docker build must be merged to `main`,
   and the "Image" workflow must have finished. Check the repo's Actions tab, or run step 1 below.
2. **A GitHub token for pulling the private image:** a classic personal access token with only
   `read:packages`. The owner creates it at github.com → Settings → Developer settings → Personal access
   tokens. You use it once for `docker login`, and don't store it anywhere else.
3. **The Claude token** from `claude setup-token`.
4. **The owner's help adding one SSH key to the VM** (step 5). You probably don't have access to the VM.

## Steps

### 1. Log in to GHCR and pull

```bash
echo '<github-token>' | docker login ghcr.io -u thomas-nelson23 --password-stdin
docker pull ghcr.io/thomas-nelson23/nextion-arduino:latest
```

If the pull is denied, the token lacks `read:packages`, or the image hasn't been published yet (step 1
of "Before you start").

### 2. Create the appdata folder

```bash
mkdir -p /mnt/user/appdata/nextion-arduino
```

### 3. Add the container

**Preferred: the Unraid template.** Save the XML at the end of this file as
`/boot/config/plugins/dockerMan/templates-user/my-nextion-arduino.xml`. Then in the Unraid web UI go
to Docker → Add Container → Template "nextion-arduino", fill in **Claude token**, check the VM values, and
Apply. The container then shows up in the Docker tab with the update button and a WebUI link.

**Equivalent `docker run`** (for checking, or if the template route isn't possible):

```bash
docker run -d --name nextion-arduino --restart unless-stopped \
  -p 8765:8765 \
  -v /mnt/user/appdata/nextion-arduino:/data \
  -e CLAUDE_CODE_OAUTH_TOKEN='<claude-token>' \
  -e VM_HOST='monta@10.1.1.62' -e VM_USER='monta' \
  -e VM_JOBROOT='C:\Users\monta\nxauto' \
  ghcr.io/thomas-nelson23/nextion-arduino:latest
```

Use one or the other, not both (same name and port).

### 4. Get the container's SSH public key

On first start, the container creates an SSH key in `/data/home/.ssh/` (that is,
`/mnt/user/appdata/nextion-arduino/home/.ssh/`) and prints the public half in its log:

```bash
docker logs nextion-arduino 2>&1 | grep -A1 'Created an SSH key'
# or
cat /mnt/user/appdata/nextion-arduino/home/.ssh/id_ed25519.pub
```

To use an existing key instead, mount it read-only at `/config/ssh/id_ed25519` (plus `.pub`). The
entrypoint copies it in with the right permissions.

### 5. Authorize that key on the Windows VM

The VM runs Windows OpenSSH, and `monta` is an administrator, so Windows reads keys from
`C:\ProgramData\ssh\administrators_authorized_keys`, **not** from the user's own `.ssh` folder. The owner
already has key access from their Linux PC ("RadioShack"), so the easiest route is for them to run this
there, with the public key from step 4 pasted in:

```bash
ssh monta@10.1.1.62 "Add-Content -Path C:\ProgramData\ssh\administrators_authorized_keys -Value 'ssh-ed25519 AAAA... nextion-arduino'"
```

PowerShell is the VM's SSH shell, so that command runs as written. Then test from Unraid:

```bash
docker exec nextion-arduino ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  -i /data/home/.ssh/id_ed25519 monta@10.1.1.62 whoami
```

This should print the VM's user, for example `win11vm\monta`. If the key is rejected, check the
key file's permissions on the VM (only Administrators and SYSTEM may have access) and that the line was
added whole.

### 6. Verify

```bash
curl -s http://localhost:8765/api/health                          # {"ok":true}
docker exec nextion-arduino arduino-cli core list                 # arduino:avr and arduino:megaavr
```

Then have the owner open `http://<unraid-ip>:8765/` and:
1. Create a project and send a message such as "Change the title to Hello and build both". The chat
   working confirms the Claude token. A successful screen build confirms the VM, the key and the
   VM user being signed in.
2. Flash from the page (see the next section about the browser).

### 7. Browser access for flashing (tell the owner)

Web Serial only works on secure pages. Plain `http://<unraid-ip>:8765` isn't one, so flashing is
blocked there until one of these is done:

- **Per browser (quick):** in Chrome/Edge open
  `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<unraid-ip>:8765`, and
  relaunch. This needs doing once on each computer that flashes.
- **HTTPS (better, later):** the owner already runs a Cloudflare tunnel on this server. A hostname
  such as `nextion.<their-domain>` pointing at `http://<unraid-ip>:8765` gives real HTTPS. **The app
  has no login of its own**, so put Cloudflare Access (an email/SSO policy limited to the owner) in front
  before exposing it, and make sure WebSockets are allowed (the default). Don't do this without the
  owner's go-ahead.

Everything except flashing (chat, builds, previews) works over plain HTTP.

## Updates

Every push to `main` publishes a new `latest`. In Unraid: Docker tab → "Check for updates" → update
`nextion-arduino`. With `docker run`: `docker pull …:latest`, then remove and re-run the container. All
state is in `/data`, so updates keep projects, chat history, libraries and the SSH key.

## Moving existing projects (optional)

Projects made while testing on the owner's PC live in that PC's checkout under `data/projects/`.
To bring them over, copy each project folder into `/mnt/user/appdata/nextion-arduino/projects/`. The
chat history comes along, but Claude's memory of those conversations doesn't (it was stored on the PC),
so the next message starts a fresh Claude session in the same project.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Chat says it stopped with an authentication error | `CLAUDE_CODE_OAUTH_TOKEN` is missing, wrong or expired. Have the owner run `claude setup-token` again and update the variable. |
| Screen build: "no result came back from the VM" | The VM is off, unreachable on port 22, or the key isn't authorized (step 5). Test with the `docker exec … whoami` command. |
| Screen build: "editor process did not start" | Nobody is signed in to the VM's desktop. Nextion Editor runs in that session, so the owner has to sign in as `monta`. |
| Sketch build: a header file is missing | Claude can install libraries itself (it has a tool for that). The libraries persist in `/data/arduino`. |
| Flash button: "This browser can't reach USB devices" | Use Chrome or Edge, and see step 7 for plain-HTTP addresses. |
| Port 8765 already used | Map another host port (`-p 9876:8765` / the template's port field). The app doesn't care. |

## Template XML (`unraid/nextion-arduino.xml`)

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>nextion-arduino</Name>
  <Repository>ghcr.io/thomas-nelson23/nextion-arduino:latest</Repository>
  <Registry>https://github.com/thomas-nelson23/nextion-arduino/pkgs/container/nextion-arduino</Registry>
  <Network>bridge</Network>
  <Shell>bash</Shell>
  <Privileged>false</Privileged>
  <Support>https://github.com/thomas-nelson23/nextion-arduino</Support>
  <Project>https://github.com/thomas-nelson23/nextion-arduino</Project>
  <Overview>Build Arduino + Nextion projects by chatting with Claude, then flash them from the browser (Chrome/Edge, Web Serial) to hardware on the computer you're using. Screen builds run on a Windows VM with Nextion Editor over SSH.</Overview>
  <Category>Tools: Productivity:</Category>
  <WebUI>http://[IP]:[PORT:8765]/</WebUI>
  <Config Name="Web UI port" Target="8765" Default="8765" Mode="tcp" Description="HTTP port of the web UI and API." Type="Port" Display="always" Required="true" Mask="false">8765</Config>
  <Config Name="Data" Target="/data" Default="/mnt/user/appdata/nextion-arduino" Mode="rw" Description="Projects, builds, chat history, Claude sessions, Arduino libraries and the container's SSH key." Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/nextion-arduino</Config>
  <Config Name="Claude token" Target="CLAUDE_CODE_OAUTH_TOKEN" Default="" Mode="" Description="From `claude setup-token` (valid for a year). Powers the chat." Type="Variable" Display="always" Required="true" Mask="true"></Config>
  <Config Name="VM host" Target="VM_HOST" Default="monta@10.1.1.62" Mode="" Description="user@address of the Windows VM running Nextion Editor (SSH)." Type="Variable" Display="always" Required="true" Mask="false">monta@10.1.1.62</Config>
  <Config Name="VM user" Target="VM_USER" Default="monta" Mode="" Description="Windows user that is signed in to the VM desktop." Type="Variable" Display="always" Required="true" Mask="false">monta</Config>
  <Config Name="VM job folder" Target="VM_JOBROOT" Default="C:\Users\monta\nxauto" Mode="" Description="Scratch folder on the VM for screen builds." Type="Variable" Display="always" Required="true" Mask="false">C:\Users\monta\nxauto</Config>
  <Config Name="Nextion Editor path" Target="VM_EDITOR" Default="C:\Program Files (x86)\Nextion Editor\Nextion Editor.exe" Mode="" Description="Path of Nextion Editor on the VM." Type="Variable" Display="advanced" Required="false" Mask="false">C:\Program Files (x86)\Nextion Editor\Nextion Editor.exe</Config>
  <Config Name="Default display series" Target="DISPLAY_SERIES" Default="Intelligent" Mode="" Description="Display series for new projects." Type="Variable" Display="advanced" Required="false" Mask="false">Intelligent</Config>
  <Config Name="Default display model" Target="DISPLAY_MODEL" Default="NX4827P043_011" Mode="" Description="Display model for new projects." Type="Variable" Display="advanced" Required="false" Mask="false">NX4827P043_011</Config>
  <Config Name="Claude model" Target="CLAUDE_MODEL" Default="claude-opus-5-5" Mode="" Description="Model used by the chat." Type="Variable" Display="advanced" Required="false" Mask="false">claude-opus-5-5</Config>
</Container>
```
