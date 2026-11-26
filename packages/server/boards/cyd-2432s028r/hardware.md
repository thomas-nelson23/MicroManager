# Hardware

Board: Cheap Yellow Display (ESP32-2432S028R). Display: the built-in 2.8" 320 x 240 touch screen, drawn by
the sketch with LVGL (Screen.h). No Nextion.

The connections are in wiring.json. Notes that don't fit there go here.

Pins are 3.3 V and not 5 V tolerant. Free pins are on the small connectors: CN1 (IO22, IO27, 3V3, GND, good for
I2C with Wire.begin(27, 22)), P3 (IO35 input only, IO22, IO21 = backlight) and P1 (VIN, the USB serial's TX/RX,
GND). The speaker connector P4 is driven from IO26 through an amplifier. Built in: RGB LED (IO4/16/17, LOW = on),
light sensor (IO34), BOOT button (IO0), micro SD slot (IO5/18/19/23). The screen and touch use IO2, 12-15, 21,
25, 32, 33, 36 and 39. Some boards (two USB ports) have an ST7789 panel instead of the ILI9341; Screen.h
detects which.
