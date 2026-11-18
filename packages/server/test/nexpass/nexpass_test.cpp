// Host-side test of NexPass.h: compiled with g++ against the fake Arduino.h beside it.
#include <iostream>
#include "../../template/sketch/NexPass.h"

unsigned long fakeMillis = 100000;
HardwareSerial Serial;
HardwareSerial Serial1;
bool escapeWhenIdle = false;
jmp_buf passthroughEscape;

static int failures = 0;
static std::string hex(const std::string &s) {
  std::string o;
  char b[8];
  for (unsigned char c : s) {
    if (c >= 0x20 && c < 0x7f) o.push_back((char)c);
    else {
      snprintf(b, sizeof b, "<%02X>", c);
      o += b;
    }
  }
  return o;
}
static void expect(const char *what, const std::string &got, const std::string &want) {
  if (got == want) return;
  failures++;
  std::cout << "FAIL " << what << "\n  got  " << hex(got) << "\n  want " << hex(want) << "\n";
}
static const std::string E = "\xff\xff\xff";
static void reset() {
  Serial.out.clear();
  Serial1.out.clear();
  Serial.in.clear();
  Serial1.in.clear();
}

static std::string lastRequest;
static void handler(const char *req) {
  lastRequest = req;
  if (!strcmp(req, "temp")) {
    Print &o = NexPass.beginReply();
    o.print("t=");
    o.print(23.5, 1);
    NexPass.endReply();
  } else {
    NexPass.reply("one");
    NexPass.reply(F("two"));
  }
}

int main() {
  NexPass.begin(Serial1);

  // No handler yet: the request still gets an answer and an end marker, and never reaches the display.
  reset();
  Serial.feed("@temp" + E);
  NexPass.poll();
  expect("no handler: display untouched", Serial1.out, "");
  expect("no handler: answer", Serial.out, "\xA5this sketch doesn't handle requests (NexPass.onRequest)" + E + "\xA6" + E);

  NexPass.onRequest(handler);

  reset();
  Serial.feed("@temp" + E);
  NexPass.poll();
  expect("request text", lastRequest, "temp");
  expect("reply built with prints", Serial.out, "\xA5t=23.5" + E + "\xA6" + E);
  expect("request not sent to display", Serial1.out, "");

  reset();
  Serial.feed("@list" + E);
  NexPass.poll();
  expect("several replies", Serial.out, "\xA5one" + E + "\xA5two" + E + "\xA6" + E);

  // A request doesn't hold back the sketch's own display output; a display instruction does (3 s).
  reset();
  NexPass.send("t0.txt=\"a\"");
  expect("send after a request", Serial1.out, "t0.txt=\"a\"" + E);
  reset();
  Serial.feed("get t0.txt" + E);
  NexPass.poll();
  expect("instruction forwarded", Serial1.out, "get t0.txt" + E);
  Serial1.out.clear();
  NexPass.send("t0.txt=\"b\"");
  expect("send held while the host talks", Serial1.out, "");

  // Display traffic goes to USB and to the sketch.
  reset();
  Serial1.feed(std::string("\x70hi") + E);
  NexPass.poll();
  expect("display reply on USB", Serial.out, std::string("\x70hi") + E);
  std::string seen;
  while (NexPass.available()) seen.push_back((char)NexPass.read());
  expect("display reply for the sketch", seen, std::string("\x70hi") + E);

  // A reply never lands inside a display message that is half way out on USB.
  reset();
  Serial1.feed("\x70" "ab");
  NexPass.poll();  // half a message forwarded
  Serial1.feed("c" + E);
  NexPass.reply("x");
  expect("reply waits for the display message", Serial.out, "\x70" "abc" + E + "\xA5x" + E);
  while (NexPass.available()) NexPass.read();

  // ... but doesn't wait forever for one that never ends (e.g. raw prints output).
  reset();
  Serial1.feed("zz");
  NexPass.poll();
  NexPass.reply("y");
  expect("reply after a cut-off message", Serial.out, "zz\xA5y" + E);
  while (NexPass.available()) NexPass.read();

  // Too long a request: an error, not silence.
  reset();
  Serial.feed("@" + std::string(120, 'a') + E);
  NexPass.poll();
  expect("long request", Serial.out, "\xA5request too long" + E + "\xA6" + E);
  expect("long request not sent to display", Serial1.out, "");

  // "@nexpass" is answered by NexPass itself, not the sketch's handler.
  reset();
  lastRequest = "";
  Serial.feed("@nexpass" + E);
  NexPass.poll();
  expect("version reply", Serial.out, "\xA5NexPass " NEXPASS_VERSION + E + "\xA6" + E);
  expect("version not passed to the handler", lastRequest, "");

  // `baud=` switches the display UART; a `whmi-wri` at that same baud leaves it alone.
  reset();
  Serial.feed("baud=115200" + E);
  NexPass.poll();
  expect("baud= forwarded", Serial1.out, "baud=115200" + E);
  expect("baud= switches", std::to_string(Serial1.baud), "115200");
  Serial1.begins = 0;
  Serial1.ends = 0;
  Serial.feed("whmi-wri 100,115200,0" + E);
  escapeWhenIdle = true;
  if (setjmp(passthroughEscape) == 0) NexPass.poll();
  escapeWhenIdle = false;
  expect("whmi-wri forwarded", Serial1.out, "baud=115200" + E + "whmi-wri 100,115200,0" + E);
  expect("whmi-wri at the current baud: no reopen", std::to_string(Serial1.begins + Serial1.ends), "0");

  if (failures) return 1;
  std::cout << "ok\n";
  return 0;
}
