// NexPass: lets the browser reach the Nextion display through your running sketch.
//
//   #include "NexPass.h"
//   void setup() { NexPass.begin(Serial1); }          // display on Serial1 at 9600
//   void loop()  { NexPass.poll(); ... }              // call often; never block for long
//
// - Instructions the host sends on USB (terminated by FF FF FF) are forwarded to the display whole.
// - Everything the display sends is copied to USB *and* kept for the sketch: read it with
//   NexPass.available() / NexPass.read(), never with Serial1.read() directly.
// - When the host starts a TFT upload (`whmi-wri size,baud,0`), NexPass switches to raw passthrough at
//   the upload baud and stays there. The host sends `baud=<upload baud>` first, so nothing changes on the
//   display line once the display starts counting TFT bytes; the host restarts the board when the upload is done (on a Teensy
//   or an RP2040, by dropping DTR, which makes NexPass reboot the board).
// - Works on the Arduino Nano Every, the Teensy 4.1 (any of Serial1..Serial8 for the display) and the
//   Raspberry Pi Pico (Serial1 or Serial2).
// - Send instructions with NexPass.send("t0.txt=\"hi\"") (adds the FF FF FF terminator).
//   For 3 s after each instruction from the host, send() drops the sketch's instructions, so they
//   can't get between the host's handshake and its next instruction (a TFT upload fails otherwise).
// - Keep Serial.print debugging out of normal operation: it shares the USB line with the display traffic.
//
// Talking to the app (Claude's device_ask tool and the page's console) without disturbing the display:
//   NexPass.onRequest(handle);                        // in setup()
//   void handle(const char *req) {                    // req is the text after '@', e.g. "codes"
//     if (!strcmp(req, "temp")) { Print &o = NexPass.beginReply(); o.print(temp, 1); NexPass.endReply(); }
//     else NexPass.reply("unknown request");
//   }
//   NexPass.reply("door opened");                     // also fine unprompted: shows in the console
// - The host sends "@<request>" + FF FF FF (at most 90 characters). NexPass keeps it from the display,
//   calls the handler from poll(), then sends an end marker so the host knows the answer is complete.
// - Each reply is one message: A5 <text> FF FF FF; the end marker is A6 FF FF FF. Don't print 0xFF
//   bytes inside a reply. Call reply() as often as needed for a long answer (one line each).
#pragma once
#include <Arduino.h>

// Bumped when the host needs to know about a change. The host asks with "@nexpass" (answered here,
// never passed to the sketch's handler). 2: upload baud set with `baud=` beforehand is kept as is.
#define NEXPASS_VERSION "2"

class NexPassClass {
 public:
  void begin(HardwareSerial &display, unsigned long displayBaud = 9600, unsigned long usbBaud = 115200) {
    disp_ = &display;
    Serial.begin(usbBaud);
    disp_->begin(displayBaud);
    baud_ = (long)displayBaud;
  }

  void poll() {
    if (!disp_) return;
    while (Serial.available()) hostByte((uint8_t)Serial.read());
    forwardDisplay();
  }

  int available() { return (int)((head_ + sizeof(ring_) - tail_) % sizeof(ring_)); }

  int read() {
    if (head_ == tail_) return -1;
    uint8_t b = ring_[tail_];
    tail_ = (uint8_t)((tail_ + 1) % sizeof(ring_));
    return b;
  }

  // Sketch output is held back while the host is talking to the display (see hostByte), so it
  // can't land between the host's handshake and its next instruction, e.g. a TFT upload.
  void send(const char *instruction) {
    if (hostBusy()) return;
    disp_->print(instruction);
    disp_->write(0xff);
    disp_->write(0xff);
    disp_->write(0xff);
  }

  HardwareSerial &display() { return *disp_; }

  typedef void (*RequestHandler)(const char *request);
  /** Handle "@..." requests from the app (see the top of this file). */
  void onRequest(RequestHandler handler) { onRequest_ = handler; }

  /** Send one message to the app. Safe to call any time; it waits (briefly) for a display message
   *  in flight on USB to finish so the two can't interleave. */
  void reply(const char *text) {
    beginReply().print(text);
    endReply();
  }
  void reply(const __FlashStringHelper *text) {
    beginReply().print(text);
    endReply();
  }
  /** For replies built from several prints: Print &o = beginReply(); o.print(...); endReply(); */
  Print &beginReply() {
    unsigned long t = millis();
    while (dispMid_ && millis() - t < 30) forwardDisplay();
    dispMid_ = false;  // a display message cut off for 30 ms is not coming back together anyway
    Serial.write((uint8_t)0xA5);
    return Serial;
  }
  void endReply() { term(); }

 private:
  HardwareSerial *disp_ = nullptr;
  RequestHandler onRequest_ = nullptr;
  bool dispMid_ = false;  // part of a display message has gone to USB, but not its FF FF FF yet
  uint8_t dispFfs_ = 0;
  uint8_t ring_[128];
  uint8_t head_ = 0, tail_ = 0;
  char line_[96];
  uint8_t len_ = 0, ffs_ = 0;
  unsigned long hostAt_ = 0;
  bool hostSeen_ = false;
  long baud_ = 0;  // the display UART's current baud

  static const unsigned long HOST_QUIET_MS = 3000;
  bool hostBusy() const { return hostSeen_ && millis() - hostAt_ < HOST_QUIET_MS; }

  // Display -> USB (and the sketch's ring buffer), tracking message boundaries for reply().
  void forwardDisplay() {
    while (disp_->available()) {
      uint8_t b = (uint8_t)disp_->read();
      Serial.write(b);
      dispFfs_ = (b == 0xff) ? dispFfs_ + 1 : 0;
      dispMid_ = dispFfs_ < 3;
      if (dispFfs_ >= 3) dispFfs_ = 0;
      uint8_t next = (uint8_t)((head_ + 1) % sizeof(ring_));
      if (next != tail_) {
        ring_[head_] = b;
        head_ = next;
      }
    }
  }

  void request(char *text) {
    if (!strcmp(text, "nexpass")) reply("NexPass " NEXPASS_VERSION);
    else if (onRequest_) onRequest_(text);
    else reply(F("this sketch doesn't handle requests (NexPass.onRequest)"));
    Serial.write((uint8_t)0xA6);
    term();
  }

  static void term() {
    Serial.write((uint8_t)0xff);
    Serial.write((uint8_t)0xff);
    Serial.write((uint8_t)0xff);
  }

  void hostByte(uint8_t b) {
    if (len_ < sizeof(line_)) line_[len_] = (char)b;
    len_++;
    ffs_ = (b == 0xff) ? ffs_ + 1 : 0;
    if (ffs_ < 3) return;
    // one complete instruction (or a bare FF FF FF)
    if (len_ > 3 && line_[0] == '@') {  // a request for the sketch, not for the display
      if (len_ <= sizeof(line_)) {
        line_[len_ - 3] = 0;
        request(line_ + 1);
      } else {
        reply(F("request too long"));
        Serial.write((uint8_t)0xA6);
        term();
      }
      len_ = 0;
      ffs_ = 0;
      return;
    }
    hostSeen_ = true;
    hostAt_ = millis();
    uint8_t n = len_ <= sizeof(line_) ? len_ : sizeof(line_);
    disp_->write((const uint8_t *)line_, n);
    uint8_t textLen = len_ >= 3 ? len_ - 3 : 0;
    if (len_ <= sizeof(line_)) {
      line_[textLen] = 0;
      if (strncmp(line_, "whmi-wri", 8) == 0) passthrough(fieldBaud(line_, 1));
      else if (strncmp(line_, "baud=", 5) == 0) switchBaud(atol(line_ + 5));
    }
    len_ = 0;
    ffs_ = 0;
  }

#if defined(__IMXRT1062__)
  static void reboot() { SCB_AIRCR = 0x05FA0004; }
#elif defined(ARDUINO_ARCH_RP2040)
  static void reboot() { rp2040.reboot(); }
#endif

  static long fieldBaud(const char *s, int field) {
    const char *p = strchr(s, ' ');
    if (!p) return 0;
    for (int i = 0; i < field; i++) {
      p = strchr(p + 1, ',');
      if (!p) return 0;
    }
    return atol(p + 1);
  }

  // Switch immediately: after `whmi-wri` the display answers 0x05 at the new baud within a few ms,
  // so any pause here can lose that acknowledgement.
  // Nothing happens when the baud is already right: the host sends `baud=` before `whmi-wri`, so the
  // UART isn't touched while the display is counting TFT bytes.
  void switchBaud(long baud) {
    if (baud < 2400 || baud > 921600 || baud == baud_) return;
    baud_ = baud;
    disp_->flush();
#if defined(ARDUINO_ARCH_RP2040)
    // RP2040: end() releases the TX pin and lets the line float, which the display reads as a stray
    // byte in the TFT data ("Data ERROR!"). Change the divider on the running UART instead.
#ifdef __SERIAL1_DEVICE
    uart_set_baudrate(disp_ == &Serial1 ? __SERIAL1_DEVICE : __SERIAL2_DEVICE, baud);
#else
    uart_set_baudrate(disp_ == &Serial1 ? uart0 : uart1, baud);
#endif
#else
    disp_->end();
    disp_->begin(baud);
#endif
  }

  // Raw transfer for a TFT upload: never returns. The host restarts the board afterwards.
  void passthrough(long baud) {
    switchBaud(baud);
#if defined(__IMXRT1062__) || defined(ARDUINO_ARCH_RP2040)
    bool dtrSeen = Serial.dtr();
#endif
    for (;;) {
      while (Serial.available()) disp_->write((uint8_t)Serial.read());
      while (disp_->available()) Serial.write((uint8_t)disp_->read());
#if defined(__IMXRT1062__) || defined(ARDUINO_ARCH_RP2040)
      // Teensy 4 and RP2040: the host can't reset the board through the USB serial line, so reboot
      // when it drops DTR (closes the port) after the upload.
      if (Serial.dtr()) dtrSeen = true;
      else if (dtrSeen) {
        delay(20);
        if (!Serial.dtr()) reboot();
      }
#endif
    }
  }
};

static NexPassClass NexPass;
