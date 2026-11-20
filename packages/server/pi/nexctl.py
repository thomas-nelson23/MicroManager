#!/usr/bin/env python3
"""
The app's tool on the Raspberry Pi (it runs over SSH; the app keeps it up to date with every deploy).

  nexctl.py run      JSON {"commands": [...], "listen": seconds} on stdin: display commands, through the
                     running program's NexPass when there is one, else straight to the UART
  nexctl.py info     the display's handshake (model, firmware) as JSON
  nexctl.py upload FILE [--expect MODEL] [--baud 115200]
                     upload a TFT straight over the UART (stop the program first); progress on stderr

Output is one JSON line: {"ok": true, ...} or {"ok": false, "error": "..."}.
"""

from __future__ import annotations

import json
import os
import socket
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

END = b"\xff\xff\xff"
STATE = os.path.expanduser("~/nextion-app/nexpass.json")
SOCKET = os.environ.get("NEXPASS_SOCKET", os.path.expanduser("~/nextion-app/nexpass.sock"))


def out(obj: dict, code: int = 0) -> None:
    print(json.dumps(obj), flush=True)
    sys.exit(code)


def port_and_baud() -> tuple[str, int]:
    try:
        with open(STATE) as f:
            s = json.load(f)
        return s.get("port") or "/dev/serial0", int(s.get("baud") or 9600)
    except (OSError, ValueError):
        return "/dev/serial0", 9600


def via_program(job: dict) -> dict | None:
    """Ask the running program's NexPass; None when no program is listening."""
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        s.connect(SOCKET)
    except OSError:
        return None
    s.settimeout(10 + 3 * len(job.get("commands", [])) + float(job.get("listen", 0)))
    with s:
        s.sendall(json.dumps(job).encode() + b"\n")
        data = b""
        while not data.endswith(b"\n"):
            chunk = s.recv(65536)
            if not chunk:
                break
            data += chunk
    return json.loads(data or b'{"ok": false, "error": "the program closed the connection"}')


def open_serial(baud: int):
    import serial

    port, _ = port_and_baud()
    try:
        return serial.Serial(port, baud, timeout=0.05)
    except serial.SerialException as e:
        out({"ok": False, "error": f"can't open {port}: {e}. Is the UART enabled (see the setup notes) and is another program using it?"}, 1)


def read_messages(ser, seconds: float, until=None) -> list[bytes]:
    deadline = time.monotonic() + seconds
    buf = b""
    msgs: list[bytes] = []
    while time.monotonic() < deadline:
        buf += ser.read(256)
        while END in buf:
            i = buf.index(END)
            msgs.append(buf[:i])
            buf = buf[i + 3 :]
        if until and until(msgs):
            break
    return msgs


def handshake(ser) -> dict | None:
    ser.write(END)
    ser.write(b"DRAKJHSUYDGBNCJHGJKSHBDN" + END)
    time.sleep(0.2)
    ser.reset_input_buffer()
    ser.write(b"connect" + END)
    for m in read_messages(ser, 1.5, lambda ms: any(x.startswith(b"comok") for x in ms)):
        if m.startswith(b"comok"):
            raw = m.decode("latin-1")
            f = raw[6:].split(",")
            g = lambda i: f[i] if len(f) > i else ""
            return {"raw": raw, "touch": g(0), "model": g(2), "firmware": g(3), "mcu": g(4), "serial": g(5), "flash": g(6)}
    return None


def connect_any(bauds=(9600, 115200, 57600, 38400, 19200, 921600)):
    _, saved = port_and_baud()
    order = [saved] + [b for b in bauds if b != saved]
    ser = open_serial(order[0])
    for b in order:
        ser.baudrate = b
        info = handshake(ser)
        if info:
            return ser, info, b
    ser.close()
    out({"ok": False, "error": "the display didn't answer 'connect' on the UART at any common baud. Is it powered, and are TX/RX crossed (Pi TX to display RX)?"}, 1)


def cmd_run() -> None:
    job = json.loads(sys.stdin.read() or "{}")
    res = via_program(job)
    if res is not None:
        out(res, 0 if res.get("ok") else 1)
    if any(c.startswith("@") for c in job.get("commands", [])):
        out({"ok": False, "error": "no program is running on the Pi to answer '@' requests. Deploy it, or check its log."}, 1)
    from nexpass import decode  # same decoding as the program's NexPass

    _, baud = port_and_baud()
    ser = open_serial(baud)
    results: list = []
    for cmd in job.get("commands", []):
        ser.reset_input_buffer()
        ser.write(cmd.encode("latin-1") + END)
        is_get = cmd.lstrip().startswith("get ")
        msgs = read_messages(ser, 0.6, lambda ms: bool(ms) and (is_get or any(len(x) == 1 for x in ms)))
        results.append({"cmd": cmd, "reply": [decode(m) for m in msgs]})
    listen = float(job.get("listen", 0))
    if listen > 0:
        results.append({"events": [decode(m) for m in read_messages(ser, listen)]})
    out({"ok": True, "replies": results, "note": "no program running: sent straight to the UART"})


def cmd_info() -> None:
    ser, info, baud = connect_any()
    ser.close()
    out({"ok": True, "display": info, "baud": baud})


def wait_ack(ser, seconds: float) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        b = ser.read(64)
        if b and 0x05 in b:
            return True
    return False


def cmd_upload(args: list[str]) -> None:
    path = args[0]
    expect = args[args.index("--expect") + 1] if "--expect" in args else ""
    upload_baud = int(args[args.index("--baud") + 1]) if "--baud" in args else 115200
    with open(path, "rb") as f:
        tft = f.read()
    ser, info, baud = connect_any()
    if expect and not info["model"].startswith(expect):
        ser.close()
        out({"ok": False, "error": f"the display is a {info['model']}, but the screen was built for {expect}"}, 1)
    ser.reset_input_buffer()
    ser.write(f"whmi-wri {len(tft)},{upload_baud},0".encode() + END)
    ser.flush()
    time.sleep(0.05)
    ser.baudrate = upload_baud
    if not wait_ack(ser, 3):
        ser.close()
        out({"ok": False, "error": "the display didn't acknowledge whmi-wri"}, 1)
    t0 = time.monotonic()
    sent = 0
    while sent < len(tft):
        chunk = tft[sent : sent + 4096]
        ser.write(chunk)
        sent += len(chunk)
        if not wait_ack(ser, 5):
            ser.close()
            out({"ok": False, "error": f"no ack after {sent} of {len(tft)} bytes; the display is in update mode, upload again"}, 1)
        print(f"progress {sent} {len(tft)}", file=sys.stderr, flush=True)
    ser.close()
    out({"ok": True, "bytes": len(tft), "seconds": round(time.monotonic() - t0, 1), "display": info["model"]})


def main() -> None:
    if len(sys.argv) < 2:
        out({"ok": False, "error": __doc__.strip()}, 2)
    sub, rest = sys.argv[1], sys.argv[2:]
    try:
        import serial  # noqa: F401
    except ImportError:
        out({"ok": False, "error": "pyserial is missing on the Pi: sudo apt install python3-serial"}, 1)
    if sub == "run":
        cmd_run()
    elif sub == "info":
        cmd_info()
    elif sub == "upload" and rest:
        cmd_upload(rest)
    else:
        out({"ok": False, "error": f"unknown command {sub}"}, 2)


if __name__ == "__main__":
    main()
