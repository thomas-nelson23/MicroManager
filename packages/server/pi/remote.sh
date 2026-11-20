#!/bin/bash
# Runs on the Raspberry Pi, from the bundle the app pipes over SSH (see src/pi.ts). Installs the app's
# tools, then the program (app.tar.gz) and/or the screen (screen.tft) that came with it, and (re)starts
# the program as the user service nextion-app. Prints "ERROR: ..." and exits non-zero on a failure.
set -uo pipefail
D="$HOME/nextion-app"
IN="$D/incoming"
EXPECT="${1:-}"
UPLOAD_BAUD="${2:-115200}"
LOG="$D/app.log"
fail() { echo "ERROR: $*"; exit 1; }

command -v python3 >/dev/null || fail "python3 is missing on the Pi"
python3 -c 'import serial' 2>/dev/null || fail "pyserial is missing on the Pi: sudo apt install python3-serial"
mkdir -p "$D/tools" "$HOME/.config/systemd/user"
cp "$IN/tools/"* "$D/tools/"

UNIT="$HOME/.config/systemd/user/nextion-app.service"
cat > "$UNIT.new" <<UNIT
[Unit]
Description=NextionDesigner program
After=network.target

[Service]
WorkingDirectory=%h/nextion-app/current
ExecStart=%h/nextion-app/python -u main.py
Restart=on-failure
RestartSec=3
StandardOutput=append:%h/nextion-app/app.log
StandardError=append:%h/nextion-app/app.log

[Install]
WantedBy=default.target
UNIT
if ! cmp -s "$UNIT.new" "$UNIT"; then mv "$UNIT.new" "$UNIT"; systemctl --user daemon-reload; else rm -f "$UNIT.new"; fi

if [[ -f $IN/screen.tft ]]; then
  systemctl --user stop nextion-app 2>/dev/null
  sleep 0.5
  python3 "$D/tools/nexctl.py" upload "$IN/screen.tft" ${EXPECT:+--expect "$EXPECT"} --baud "$UPLOAD_BAUD"
  rc=$?
  [[ -d $D/current ]] && systemctl --user start nextion-app
  [[ $rc -eq 0 ]] || fail "the screen upload failed"
  echo "OK: screen uploaded"
  # the display restarts after an upload; give it a moment before the program talks to it
  sleep 2
fi

if [[ -f $IN/app.tar.gz ]]; then
  rm -rf "$D/next" && mkdir -p "$D/next"
  tar -xzf "$IN/app.tar.gz" -C "$D/next" || fail "couldn't unpack the program"
  [[ -f $D/next/main.py ]] || fail "the build has no main.py"
  # Python packages the program needs beyond Raspberry Pi OS's own, in a venv that also sees the system's
  if [[ -s $D/next/requirements.txt ]]; then
    if ! cmp -s "$D/next/requirements.txt" "$D/venv/requirements.txt" 2>/dev/null; then
      [[ -x $D/venv/bin/python3 ]] || python3 -m venv --system-site-packages "$D/venv" || fail "couldn't create a venv (sudo apt install python3-venv)"
      "$D/venv/bin/pip" install -q -r "$D/next/requirements.txt" || fail "pip couldn't install requirements.txt"
      cp "$D/next/requirements.txt" "$D/venv/requirements.txt"
    fi
    ln -sfn "$D/venv/bin/python3" "$D/python"
  else
    ln -sfn "$(command -v python3)" "$D/python"
  fi
  rm -rf "$D/prev"
  [[ -d $D/current ]] && mv "$D/current" "$D/prev"
  mv "$D/next" "$D/current"
  # keep the log short: only the last run's tail survives a deploy
  [[ -f $LOG ]] && tail -n 200 "$LOG" > "$LOG.old" && : > "$LOG"
  systemctl --user enable nextion-app >/dev/null 2>&1
  systemctl --user restart nextion-app || fail "systemd couldn't start the program"
  sleep 3
  if ! systemctl --user is-active --quiet nextion-app; then
    echo "ERROR: the program stopped right after starting. Its output:"
    tail -n 25 "$LOG"
    exit 1
  fi
  echo "OK: program running"
  ME="${USER:-$(id -un)}"
  [[ $(loginctl show-user "$ME" -p Linger --value 2>/dev/null) == yes ]] || echo "WARN: lingering is off, so the program stops when you log out and won't start at boot: sudo loginctl enable-linger $ME"
fi
rm -rf "$IN"
