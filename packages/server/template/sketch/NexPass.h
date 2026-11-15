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
//   the upload baud and stays there; the host restarts the board when the upload is done.
// - Send instructions with NexPass.send("t0.txt=\"hi\"") (adds the FF FF FF terminator).
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

  void send(const char *instruction) {
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

  void hostByte(uint8_t b) {
    if (len_ < sizeof(line_)) line_[len_] = (char)b;
    len_++;
    ffs_ = (b == 0xff) ? ffs_ + 1 : 0;
    if (ffs_ < 3) return;
    // one complete instruction (or a bare FF FF FF)
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

  static long fieldBaud(const char *s, int field) {
    const char *p = strchr(s, ' ');
    if (!p) return 0;
    for (int i = 0; i < field; i++) {
      p = strchr(p + 1, ',');
      if (!p) return 0;
    }
    return atol(p + 1);
  }

  void switchBaud(long baud) {
    if (baud < 2400) return;
    disp_->flush();
    delay(20);
    disp_->begin(baud);
  }

  // Raw transfer for a TFT upload: never returns. The host restarts the board afterwards.
  void passthrough(long baud) {
    switchBaud(baud);
    for (;;) {
      while (Serial.available()) disp_->write((uint8_t)Serial.read());
      while (disp_->available()) Serial.write((uint8_t)disp_->read());
    }
  }
};

static NexPassClass NexPass;
