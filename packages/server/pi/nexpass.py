"""
NexPass for the Raspberry Pi: the program's link to the Nextion display, and the app's way in.

The app owns this file: every build copies the current version into the project, so don't edit it.

    import nexpass
    nex = nexpass.NexPass("/dev/serial0", 9600)    # the display on the GPIO UART (pins 8 TX / 10 RX)

    def handle(req):                                # "@codes" from the app arrives here as "codes"
        if req == "codes":
            for c in codes:
                nex.reply(c)
        else:
            nex.reply("unknown request")
    nex.on_request(handle)

    while True:
        for msg in nex.poll():                      # what the display sent since the last poll
            ev = nexpass.decode(msg)                # {"touch": {...}}, {"string": "..."}, {"number": 5}, ...
            ...
        nex.send('t0.txt="hi"')
        time.sleep(0.02)

poll() also answers the app's "@" requests (on the caller's thread, so handlers can use the program's
state freely). The app's display commands and the device console reach the display through a local
socket while the program runs: their replies also show up in poll(), as on the Arduino version.
"""

from __future__ import annotations

import json
import os
import queue
import socket
import struct
import threading
import time

import serial  # pyserial (python3-serial)

VERSION = "1"
END = b"\xff\xff\xff"
SOCKET = os.environ.get("NEXPASS_SOCKET", os.path.expanduser("~/nextion-app/nexpass.sock"))
STATE = os.path.expanduser("~/nextion-app/nexpass.json")

RETURN_CODES = {
    0x00: "invalid instruction", 0x01: "ok", 0x02: "invalid component id", 0x03: "invalid page id",
    0x04: "invalid picture id", 0x05: "invalid font id", 0x11: "invalid baud", 0x1A: "invalid variable name",
    0x1B: "invalid variable operation", 0x1C: "assignment failed", 0x1E: "invalid parameter count",
    0x1F: "IO operation failed", 0x20: "invalid escape character", 0x23: "variable name too long",
    0x24: "serial buffer overflow", 0x86: "auto sleep", 0x87: "auto wake", 0x88: "ready",
}


def decode(m: bytes) -> dict:
    """One display message (without FF FF FF) as a dict, the same shapes the app's console shows."""
    if not m:
        return {"raw": ""}
    t = m[0]
    if t == 0x70:
        return {"string": m[1:].decode("latin-1")}
    if t == 0x71 and len(m) >= 5:
        return {"number": struct.unpack("<i", m[1:5])[0]}
    if t == 0x65 and len(m) >= 4:
        return {"touch": {"page": m[1], "component": m[2], "event": "press" if m[3] else "release"}}
    if t == 0x66 and len(m) >= 2:
        return {"page": m[1]}
    if len(m) == 1 and t in RETURN_CODES:
        return {"code": f"0x{t:x}", "meaning": RETURN_CODES[t]}
    return {"raw": " ".join(f"{b:02x}" for b in m)}


class NexPass:
    def __init__(self, port: str = "/dev/serial0", baud: int = 9600):
        self.port_name = port
        self.ser = serial.Serial(port, baud, timeout=0.05)
        self._lock = threading.Lock()  # one writer at a time on the UART
        self._inbox: "queue.Queue[bytes]" = queue.Queue()
        self._listeners: list["queue.Queue[bytes]"] = []
        self._requests: "queue.Queue[tuple[str, list[str], threading.Event]]" = queue.Queue()
        self._handler = None
        self._replies: list[str] | None = None
        try:
            os.makedirs(os.path.dirname(STATE), exist_ok=True)
            with open(STATE, "w") as f:
                json.dump({"port": port, "baud": baud, "pid": os.getpid()}, f)
        except OSError:
            pass
        threading.Thread(target=self._reader, daemon=True).start()
        threading.Thread(target=self._server, daemon=True).start()

    # ---- for the program ----

    def send(self, instruction: str) -> None:
        """Send one Nextion instruction, e.g. 't0.txt="hi"' or 'page 1'."""
        data = instruction.encode("latin-1") + END
        with self._lock:
            self.ser.write(data)

    def poll(self) -> list[bytes]:
        """Answer pending "@" requests, and return the messages the display sent since the last call."""
        while True:
            try:
                req, lines, done = self._requests.get_nowait()
            except queue.Empty:
                break
            self._replies = lines
            try:
                if req == "nexpass":
                    self.reply(f"NexPass {VERSION} (Raspberry Pi)")
                elif self._handler:
                    self._handler(req)
                else:
                    self.reply("this program doesn't handle requests (nex.on_request)")
            except Exception as e:  # a failing handler must not stop the program
                self.reply(f"error: {e}")
            finally:
                self._replies = None
                done.set()
        out = []
        while True:
            try:
                out.append(self._inbox.get_nowait())
            except queue.Empty:
                return out

    def on_request(self, handler) -> None:
        """handler(req: str) answers the app's "@req" with nex.reply(...) calls."""
        self._handler = handler

    def reply(self, text: str) -> None:
        """One line of the answer to an "@" request (outside a request it only goes to the log)."""
        if self._replies is not None:
            self._replies.append(str(text))
        else:
            print(f"nexpass: {text}", flush=True)

    # ---- internals ----

    def _reader(self) -> None:
        buf = b""
        while True:
            try:
                chunk = self.ser.read(256)
            except serial.SerialException:
                time.sleep(0.2)
                continue
            if not chunk:
                continue
            buf += chunk
            while True:
                i = buf.find(END)
                if i < 0:
                    break
                msg, buf = buf[:i], buf[i + 3 :]
                self._inbox.put(msg)
                for q in list(self._listeners):
                    q.put(msg)

    def _server(self) -> None:
        try:
            os.unlink(SOCKET)
        except OSError:
            pass
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.bind(SOCKET)
        os.chmod(SOCKET, 0o600)
        s.listen(2)
        while True:
            conn, _ = s.accept()
            threading.Thread(target=self._client, args=(conn,), daemon=True).start()

    def _client(self, conn: socket.socket) -> None:
        with conn:
            f = conn.makefile("rwb")
            line = f.readline()
            try:
                job = json.loads(line)
                out = self.run(job.get("commands", []), float(job.get("listen", 0)))
                f.write(json.dumps({"ok": True, "replies": out}).encode() + b"\n")
            except Exception as e:
                f.write(json.dumps({"ok": False, "error": str(e)}).encode() + b"\n")
            f.flush()

    def run(self, commands: list[str], listen: float = 0) -> list:
        """The app's display commands: each command's replies, then any events within `listen` seconds."""
        results: list = []
        q: "queue.Queue[bytes]" = queue.Queue()
        self._listeners.append(q)
        try:
            for cmd in commands:
                if cmd.startswith("@"):
                    req = cmd[1:].strip()
                    lines: list[str] = []
                    done = threading.Event()
                    self._requests.put((req, lines, done))
                    if not done.wait(3):
                        raise RuntimeError("the program didn't answer within 3 s. Is it calling nex.poll() often?")
                    results.append({"cmd": cmd, "reply": [{"sketch": l} for l in lines]})
                    continue
                _drain(q)
                self.send(cmd)
                results.append({"cmd": cmd, "reply": [decode(m) for m in _collect(q, cmd)]})
            if listen > 0:
                events = [decode(m) for m in _collect(q, None, listen)]
                results.append({"events": events})
        finally:
            self._listeners.remove(q)
        return results


def _drain(q: "queue.Queue[bytes]") -> None:
    while True:
        try:
            q.get_nowait()
        except queue.Empty:
            return


def _collect(q: "queue.Queue[bytes]", cmd: str | None, seconds: float = 0.6) -> list[bytes]:
    """Replies to `cmd` (a get ends at the first message, others at a return code), or everything for `seconds`."""
    is_get = cmd is not None and cmd.lstrip().startswith("get ")
    deadline = time.monotonic() + seconds
    out: list[bytes] = []
    while True:
        left = deadline - time.monotonic()
        if left <= 0:
            return out
        try:
            m = q.get(timeout=left)
        except queue.Empty:
            return out
        out.append(m)
        if cmd is not None and (is_get or len(m) == 1):
            return out
