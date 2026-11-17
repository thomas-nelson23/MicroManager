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
//   the upload baud and stays there; the host restarts the board when the upload is done (on a Teensy
//   or an RP2040, by dropping DTR, which makes NexPass reboot the board).
// - Works on the Arduino Nano Every, the Teensy 4.1 (any of Serial1..Serial8 for the display) and the
//   Raspberry Pi Pico (Serial1 or Serial2).
// - Send instructions with NexPass.send("t0.txt=\"hi\"") (adds the FF FF FF terminator).
//   For 3 s after each instruction from the host, send() drops the sketch's instructions, so they
//   can't get between the host's handshake and its next instruction (a TFT upload fails otherwise).
// - Keep Serial.print debugging out of normal operation: it shares the USB line with the display traffic.
#pragma once
#include <Arduino.h>

class NexPassClass {
 public:
  void begin(HardwareSerial &display, unsigned long displayBaud = 9600, unsigned long usbBaud = 115200) {
    disp_ = &display;
    Serial.begin(usbBaud);
    disp_->begin(displayBaud);
  }

  void poll() {
    if (!disp_) return;
    while (Serial.available()) hostByte((uint8_t)Serial.read());
    while (disp_->available()) {
      uint8_t b = (uint8_t)disp_->read();
      Serial.write(b);
      uint8_t next = (uint8_t)((head_ + 1) % sizeof(ring_));
      if (next != tail_) {
        ring_[head_] = b;
        head_ = next;
      }
    }
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

 private:
  HardwareSerial *disp_ = nullptr;
  uint8_t ring_[128];
  uint8_t head_ = 0, tail_ = 0;
  char line_[96];
  uint8_t len_ = 0, ffs_ = 0;
  unsigned long hostAt_ = 0;
  bool hostSeen_ = false;

  static const unsigned long HOST_QUIET_MS = 3000;
  bool hostBusy() const { return hostSeen_ && millis() - hostAt_ < HOST_QUIET_MS; }

  void hostByte(uint8_t b) {
    if (len_ < sizeof(line_)) line_[len_] = (char)b;
    len_++;
    ffs_ = (b == 0xff) ? ffs_ + 1 : 0;
    if (ffs_ < 3) return;
    // one complete instruction (or a bare FF FF FF)
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
  void switchBaud(long baud) {
    if (baud < 2400 || baud > 921600) return;
    disp_->flush();
    disp_->end();
    disp_->begin(baud);
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
