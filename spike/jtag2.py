"""Spike: JTAGICE mkII (jtag2updi) framing + 1200-baud touch experiments for the Nano Every."""
import os, sys, time, termios, select, struct, fcntl
P = "/dev/ttyACM0"

def crc(b):
    c = 0xffff
    for x in b:
        c ^= x
        for _ in range(8):
            c = (c >> 1) ^ 0x8408 if c & 1 else c >> 1
    return c

def frame(seq, body):
    f = bytes([0x1b]) + struct.pack("<HI", seq, len(body)) + b"\x0e" + body
    return f + struct.pack("<H", crc(f))

assert frame(0, b"\x01")[-2:] == bytes([0xf3, 0x97])

def setbaud(fd, b, hupcl=True):
    a = termios.tcgetattr(fd)
    a[0] = a[1] = a[3] = 0
    a[2] = termios.CS8 | termios.CREAD | termios.CLOCAL | (termios.HUPCL if hupcl else 0)
    a[4] = a[5] = b
    a[6][termios.VMIN] = 0; a[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, a)

def modem(fd, bits, on):
    fcntl.ioctl(fd, termios.TIOCMBIS if on else termios.TIOCMBIC, struct.pack("I", bits))

def rx(fd, secs):
    buf, t = b"", time.time() + secs
    while time.time() < t:
        r, _, _ = select.select([fd], [], [], 0.02)
        if r:
            buf += os.read(fd, 1024)
        if len(buf) >= 10 and len(buf) >= 10 + struct.unpack("<I", buf[3:7])[0]:
            break
    return buf

def openp(baud, hupcl=True):
    fd = os.open(P, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    setbaud(fd, baud, hupcl)
    return fd

def touch(hupcl=True):
    fd = openp(termios.B1200, hupcl)
    if not hupcl:
        modem(fd, termios.TIOCM_DTR, False)
    os.close(fd)

def signon(fd, tries=4):
    for seq in range(tries):
        os.write(fd, frame(seq, b"\x01"))
        b = rx(fd, 1.0)
        if b:
            return seq, b
    return None, b""
