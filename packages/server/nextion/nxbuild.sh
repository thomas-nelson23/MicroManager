#!/usr/bin/env bash
# Compile a Nextion job folder into .HMI + .tft with Nextion Editor on the Windows VM.
#   nxbuild.sh <jobdir> <name> <outdir>
# Environment: VM_HOST, VM_USER, VM_JOBROOT, VM_EDITOR, BUILD_TIMEOUT, DISPLAY_SERIES, DISPLAY_MODEL,
# optional SSH_KEY (identity file). Writes <outdir>/<name>.tft, <name>.HMI and result.json.
# Exit 0 = built, 1 = failed (reason on stdout as "ERROR: ..."), 2 = usage.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ $# -eq 3 && -d $1 ]] || { echo "usage: $0 <jobdir> <name> <outdir>" >&2; exit 2; }
JOB="$(cd "$1" && pwd)"; NAME="$2"; OUT="$3"
[[ $NAME =~ ^[A-Za-z0-9_-]+$ ]] || { echo "ERROR: job name must be letters, digits, _ or -"; exit 2; }
: "${VM_HOST:?}" "${VM_USER:?}" "${VM_JOBROOT:?}" "${VM_EDITOR:?}"
BUILD_TIMEOUT="${BUILD_TIMEOUT:-150}"
export DISPLAY_SERIES DISPLAY_MODEL

KEY=(); [[ -n ${SSH_KEY:-} ]] && KEY=(-i "$SSH_KEY")
OPTS=(-o BatchMode=yes -o LogLevel=ERROR -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "${KEY[@]}")
SSH=(ssh "${OPTS[@]}" "$VM_HOST")
SFTP=(sftp -q "${OPTS[@]}" "$VM_HOST")
VM_ROOT_SFTP="/${VM_JOBROOT//\\//}"

STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$NAME/font" "$STAGE/$NAME/img"
python3 -I "$HERE/nxprep.py" "$JOB" "$STAGE/$NAME/hmi.txt" --jobname "$NAME" --jobroot "$VM_JOBROOT"
cp "$JOB/star.txt" "$STAGE/$NAME/star.txt"
for d in "$JOB"/font "$JOB"/img "$JOB"/ico[0-9]*; do
  [[ -d $d ]] && cp -r "$d/." "$STAGE/$NAME/$(basename "$d")/"
done
tar -C "$STAGE" -cf "$STAGE/$NAME.tar" "$NAME"

"${SSH[@]}" "New-Item -ItemType Directory -Force '$VM_JOBROOT\\_tools','$VM_JOBROOT\\_upload' | Out-Null"
"${SFTP[@]}" >/dev/null <<EOF
put "$STAGE/$NAME.tar" "$VM_ROOT_SFTP/_upload/$NAME.tar"
put "$HERE/vm/nxrun.ps1" "$VM_ROOT_SFTP/_tools/nxrun.ps1"
put "$HERE/vm/nxdiag.ps1" "$VM_ROOT_SFTP/_tools/nxdiag.ps1"
EOF
"${SSH[@]}" "\$d='$VM_JOBROOT\\$NAME'; if (Test-Path \$d) { Remove-Item \$d -Recurse -Force }; tar -xf '$VM_JOBROOT\\_upload\\$NAME.tar' -C '$VM_JOBROOT'"
"${SSH[@]}" "powershell -NoProfile -ExecutionPolicy Bypass -File '$VM_JOBROOT\\_tools\\nxrun.ps1' -JobDir '$VM_JOBROOT\\$NAME' -Editor '$VM_EDITOR' -Timeout $BUILD_TIMEOUT -User $VM_USER" >/dev/null || true

mkdir -p "$OUT"
"${SFTP[@]}" >/dev/null 2>&1 <<EOF || true
lcd "$OUT"
cd "$VM_ROOT_SFTP/$NAME/out"
mget *
EOF
[[ -f $OUT/result.json ]] || { echo "ERROR: no result came back from the VM (is it running and reachable?)"; exit 1; }
python3 -I - "$OUT/result.json" <<'EOF'
import json, sys
r = json.load(open(sys.argv[1], encoding="utf-8-sig"))
if r.get("ok"):
    print(f"OK: built in {r['seconds']} s, tft {r['tft_bytes']} bytes")
else:
    print(f"ERROR: {r.get('error')}")
    if r.get("dialog_text"):
        print("editor dialog: " + r["dialog_text"])
    sys.exit(1)
EOF
