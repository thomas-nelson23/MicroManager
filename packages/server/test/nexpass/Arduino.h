// Just enough of the Arduino API to compile NexPass.h on a PC and test it (see nexpass.test.ts).
#pragma once
#include <csetjmp>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <string>

extern unsigned long fakeMillis;
inline unsigned long millis() { return fakeMillis++; }  // time moves on every look, so waits end
inline void delay(unsigned long ms) { fakeMillis += ms; }

// NexPass's TFT passthrough never returns: with escapeWhenIdle set, the first available() call that
// finds nothing to read jumps back to passthroughEscape.
extern bool escapeWhenIdle;
extern jmp_buf passthroughEscape;

class __FlashStringHelper;
#define F(s) (reinterpret_cast<const __FlashStringHelper *>(s))

class Print {
 public:
  virtual ~Print() {}
  virtual size_t write(uint8_t b) = 0;
  size_t write(const uint8_t *p, size_t n) {
    for (size_t i = 0; i < n; i++) write(p[i]);
    return n;
  }
  size_t print(const char *s) { return write((const uint8_t *)s, strlen(s)); }
  size_t print(const __FlashStringHelper *s) { return print(reinterpret_cast<const char *>(s)); }
  size_t print(long v) {
    char b[24];
    snprintf(b, sizeof b, "%ld", v);
    return print(b);
  }
  size_t print(int v) { return print((long)v); }
  size_t print(double v, int digits = 2) {
    char b[32];
    snprintf(b, sizeof b, "%.*f", digits, v);
    return print(b);
  }
};

class HardwareSerial : public Print {
 public:
  std::deque<uint8_t> in;  // bytes waiting to be read
  std::string out;         // bytes written
  long baud = 0;
  int begins = 0, ends = 0;
  void begin(unsigned long b) {
    baud = (long)b;
    begins++;
  }
  void end() { ends++; }
  void flush() {}
  bool dtr() { return true; }
  int available() {
    if (in.empty() && escapeWhenIdle) longjmp(passthroughEscape, 1);
    return (int)in.size();
  }
  int read() {
    if (in.empty()) return -1;
    int b = in.front();
    in.pop_front();
    return b;
  }
  using Print::write;
  size_t write(uint8_t b) override {
    out.push_back((char)b);
    return 1;
  }
  void feed(const std::string &s) { in.insert(in.end(), s.begin(), s.end()); }
};

extern HardwareSerial Serial;
extern HardwareSerial Serial1;
