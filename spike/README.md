# Spike: browser-capable flashing (2026-11-15)

Findings from flashing the Nano Every and uploading Nextion TFTs without avrdude, on RadioShack.

- `avrdude-trace.log`: avrdude 6.3 `-vvvv` session for `-patmega4809 -cjtag2updi` (the reference for
  `packages/flasher/src/jtag2updi.ts`). `devdescr-atmega4809.bin`: the 299-byte device descriptor it sends.
- **Entering programming mode (1200-baud touch):** a plain touch fails if the previous session ended by
  dropping DTR, which is the default close on Linux and in browsers. Opening once with DTR high before the
  touch, or toggling DTR while at 1200, works every time (`exp_touch.py`, `exp_close.py`).
- **The USB chip stays in programming mode** after a touch until a jtag2updi session signs off. "Reset the
  board" therefore means a minimal session: sign on, init, leave progmode, reset, go, sign off.
- **The first reply** after entering programming mode can take about a second. Resending sign-on too early
  makes replies lag by one message, so wait long (2.5 s).
- **Node only:** serialport 13 on Node 26 doesn't deliver incoming data while the event loop idles in one
  long timer. `NodeSerialTransport` keeps a 5 ms interval running while open. Web Serial is unaffected.
- `NexBridge/`, `HelloFlash/`: test sketches. `nextion/demo`: the two-page demo job.
