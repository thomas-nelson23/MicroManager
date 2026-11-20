# Hardware

Board: Raspberry Pi 4. Display: Nextion on the GPIO UART (/dev/serial0: pin 8 GPIO14 TX, pin 10 GPIO15 RX) at 9600 baud.

The connections are in wiring.json. Notes that don't fit there go here.

The Pi's GPIO pins are 3.3 V and not 5 V tolerant. The Nextion's TX is 3.3 V, so the serial wires connect
directly; never feed a 5 V signal into a GPIO pin. Power the Nextion from a 5 V pin (pin 2 or 4); a
larger display may need its own 5 V supply (with a shared GND). The Pi has no analog inputs: use an ADC
such as an ADS1115 on I2C.
