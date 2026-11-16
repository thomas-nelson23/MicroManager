# Hardware

Board: Teensy 4.1. Display: Nextion on Serial1 (pins 0/1) at 9600 baud.

The connections are in wiring.json. Notes that don't fit there go here.

Teensy 4.1 pins are 3.3 V and not 5 V tolerant. The Nextion's TX is 3.3 V, so the serial wires connect
directly; never feed a 5 V signal into a Teensy pin. VIN carries the USB 5 V when the Teensy runs from USB.
More hardware serial ports: Serial2 (7 RX, 8 TX), Serial3 (15/14), Serial4 (16/17), Serial5 (21/20),
Serial6 (25/24), Serial7 (28/29), Serial8 (34/35).
