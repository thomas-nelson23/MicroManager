# Hardware

Board: Raspberry Pi Pico (RP2040). Display: Nextion on Serial1 (GP0 TX, GP1 RX) at 9600 baud.

The connections are in wiring.json. Notes that don't fit there go here.

Pico pins are 3.3 V and not 5 V tolerant. The Nextion's TX is 3.3 V, so the serial wires connect
directly; never feed a 5 V signal into a Pico pin. VBUS carries the USB 5 V when the Pico runs from USB.
Serial2 is on GP8 (TX) / GP9 (RX). Only GP26-GP28 are analog inputs (A0-A2).
