# Hardware

Board: Adafruit Feather RP2040 Prop-Maker. Display: Nextion on Serial1 (TX = GPIO0, RX = GPIO1) at 9600 baud.

The connections are in wiring.json. Notes that don't fit there go here.

Pins are 3.3 V and not 5 V tolerant. The Nextion's TX is 3.3 V, so the serial wires connect directly.
USB carries the USB 5 V when the board runs from USB; the Nextion takes its power from there.
Built in: NeoPixel (GPIO4), red LED (D13), Boot button (GPIO7), LIS3DH accelerometer on I2C (interrupt GPIO22),
I2S amplifier (GPIO16-18). Terminal block: button GPIO19, NeoPixels GPIO21, 5 V. Servo header GPIO20.
The terminal 5 V, servo header and amplifier are off until GPIO23 (PIN_EXTERNAL_POWER) is set HIGH.
