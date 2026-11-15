import sys, time, os, termios
from jtag2 import *
def session_hup():
    """A programming session that ends with DTR dropped (the bad case)."""
    touch(); fd = openp(termios.B115200, hupcl=True); seq, b = signon(fd)
    if seq is not None: os.write(fd, frame(seq + 1, b"\x00")); rx(fd, 0.5)
    os.close(fd); time.sleep(1.5); return seq is not None
def t_double():
    touch(); time.sleep(0.3); touch()
def t_toggle():
    fd = openp(termios.B1200, hupcl=True)
    for v in (False, True, False, True): modem(fd, termios.TIOCM_DTR, v); time.sleep(0.05)
    os.close(fd)
def t_pre115():
    fd = openp(termios.B115200, hupcl=False); time.sleep(0.2); os.close(fd); touch()
def t_wait():
    time.sleep(3); touch()
variants = {"double": t_double, "toggle": t_toggle, "pre115": t_pre115, "wait3": t_wait, "plain": touch}
for name in sys.argv[1:]:
    res = []
    for i in range(3):
        session_hup()                     # put it in the bad state
        variants[name]()
        fd = openp(termios.B115200, hupcl=False); seq, b = signon(fd)
        if seq is not None: os.write(fd, frame(seq + 1, b"\x00")); rx(fd, 0.5)
        os.close(fd); time.sleep(1.5)
        res.append("OK" if seq is not None else "--")
    print(f"{name:7s} after a DTR-drop close: {' '.join(res)}")
