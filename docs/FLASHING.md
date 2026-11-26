# Flashing

Flashing happens in the browser, on whatever computer the board is plugged into. It needs Chrome or Edge
(Web Serial, plus WebHID for a Teensy) on `localhost` or HTTPS. On a plain-HTTP LAN address, add that
address under `chrome://flags/#unsafely-treat-insecure-origin-as-secure` and relaunch the browser.

## Arduino Nano Every

Plug it in, press **Flash**, pick the port. The sketch goes over USB, then the screen goes to the display
through the running sketch (NexPass), so the display needs no separate USB adapter.

## Teensy 4.1

The page reboots the running sketch into the HalfKay bootloader (134-baud touch), and the first time Chrome
asks you to allow "Teensy HalfKay". A blank Teensy, or one whose sketch has crashed, needs its button
pressed. Every build's sketch can also be downloaded as a .hex for PJRC's Teensy Loader.

**On Linux**, install PJRC's udev rules once, or Chrome can't open the Teensy (its USB and bootloader
devices are root-only by default, and ModemManager may grab its serial port):

```bash
curl -fsSLO https://www.pjrc.com/teensy/00-teensy.rules
sudo cp 00-teensy.rules /etc/udev/rules.d/ && sudo udevadm control --reload-rules && sudo udevadm trigger
```

Then replug the Teensy. Your user also needs serial access (`dialout`, or `uucp` on Arch-based systems).
A new Teensy runs a factory blink sketch with no serial port, so the port picker won't list it: flash it
once with the button method above (or Teensy Loader), and from then on the app's sketches keep USB serial.

## Raspberry Pi Pico and Adafruit Feather RP2040 Prop-Maker

The build's .uf2 is copied onto the board's BOOTSEL drive (RPI-RP2). The page reboots the running sketch
into BOOTSEL (1200-baud touch), and the first time per visit you pick the RPI-RP2 drive in Chrome's folder
picker and allow editing. A blank board, or one whose sketch has crashed, needs BOOT (BOOTSEL) held while
plugging it in or pressing reset. The flash dialog also offers the .uf2 to drag onto the drive by hand.
On Linux the drive has to be mounted (most desktops do that when it appears).

## ESP32 DevKitC and ESP32-S3 DevKitC-1

Plug it in, press **Flash**, pick the port (a CP210x or CH340 USB serial). The page puts the ESP32 in its ROM
bootloader through the USB chip's reset lines, the way esptool does, and writes the bootloader, partition
table and sketch. Saved settings (NVS, `Preferences`) and files (SPIFFS, LittleFS) are left as they are.
On an ESP32-S3 DevKitC-1, use the USB port marked **UART** (or COM): it is the sketch's `Serial`, which the
display traffic goes through.

If the page can't reach the bootloader (some boards and clones have no auto-reset circuit), hold **BOOT**,
press and release **EN** (or RST), let go of BOOT, and flash again. Each build's sketch can also be downloaded
as a merged .bin, which `esptool.py write_flash 0x0 sketch.bin` (or Espressif's web flasher) writes whole;
that also erases saved settings.

On Linux your user needs serial access (`dialout`, or `uucp` on Arch-based systems). Older CH340 drivers on
macOS may need WCH's driver.

