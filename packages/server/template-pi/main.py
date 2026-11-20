# New project: shows the uptime on the display. Ask Claude to replace this with your project.
import time

import nexpass

nex = nexpass.NexPass("/dev/serial0", 9600)  # display on the GPIO UART: pin 8 (TX) and pin 10 (RX)

start = time.monotonic()
last = 0.0
while True:
    nex.poll()
    now = time.monotonic()
    if now - last >= 1:
        last = now
        nex.send(f'tUptime.txt="{int(now - start)} s"')
    time.sleep(0.02)
