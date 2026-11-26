# Hardware

Board: ESP32 DevKitC (ESP32-WROOM-32). Display: Nextion on Serial1 (GPIO17 TX, GPIO16 RX) at 9600 baud.

The connections are in wiring.json. Notes that don't fit there go here.

ESP32 pins are 3.3 V and not 5 V tolerant. The Nextion's TX is 3.3 V, so the serial wires connect
directly; never feed a 5 V signal into an ESP32 pin. The 5V pin carries the USB 5 V when the board runs
from USB. Avoid GPIO6-11 (the module's flash); GPIO34-39 are inputs only; GPIO0, 2, 5, 12 and 15 are
strapping pins (nothing that pulls them at power-up). GPIO1/3 are the USB serial.
