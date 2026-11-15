import sys, time, os, termios
from jtag2 import *
# arg: hupcl for the programming session close (1/0), cycles
hup = sys.argv[1] == "1"
for i in range(int(sys.argv[2])):
    touch()
    fd = openp(termios.B115200, hupcl=hup)
    seq, b = signon(fd)
    if seq is not None:
        os.write(fd, frame(seq + 1, b"\x00")); rx(fd, 0.5)
    print(f"hupcl={hup} cycle {i}: {'OK' if seq is not None else 'no reply'}")
    os.close(fd); time.sleep(2)
