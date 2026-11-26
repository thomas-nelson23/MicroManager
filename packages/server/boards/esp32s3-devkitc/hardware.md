# Hardware

Board: ESP32-S3 DevKitC-1. Display: Nextion on Serial1 (GPIO17 TX, GPIO18 RX) at 9600 baud.

The connections are in wiring.json. Notes that don't fit there go here.

ESP32-S3 pins are 3.3 V and not 5 V tolerant. The Nextion's TX is 3.3 V, so the serial wires connect
directly; never feed a 5 V signal into an ESP32-S3 pin. Plug the USB cable into the port marked UART
(or COM): that is the sketch's Serial and the one the app flashes through. GPIO19/20 are the other USB
port; GPIO35-37 are taken by the PSRAM on N8R8/N16R8 modules; GPIO0, 3, 45 and 46 are strapping pins.
On-board RGB LED: GPIO48 (v1.0) or GPIO38 (v1.1).
