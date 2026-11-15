// NexBridge: USB Serial <-> Serial1 passthrough so a PC can talk to (and upload
// TFTs to) a Nextion wired to an Arduino Nano Every's D0/D1.
//
// USB side runs at a fixed 115200. The Nextion side starts at 9600 and follows
// the display: when the host sends "baud=N" or "whmi-wri size,N,x" (terminated
// by FF FF FF), Serial1 switches to N, the same moment the display does.
// After whmi-wri the sketch stops parsing, because what follows is raw TFT data.

const long USB_BAUD = 115200;
long nexBaud = 9600;

char line[64];
uint8_t len = 0;
uint8_t ffRun = 0;
bool transferring = false;

static long field(const char *s, int idx) {  // idx-th comma field after first space
  const char *p = strchr(s, ' ');
  if (!p) return -1;
  p++;
  for (int i = 0; i < idx; i++) {
    p = strchr(p, ',');
    if (!p) return -1;
    p++;
  }
  return atol(p);
}

static void switchBaud(long b) {
  if (b < 2400 || b > 921600) return;
  Serial1.flush();
  Serial1.end();
  nexBaud = b;
  Serial1.begin(nexBaud);
}

static void watch(uint8_t c) {
  if (transferring) return;
  if (c == 0xFF) {
    if (++ffRun == 3) {
      line[len] = 0;
      if (strncmp(line, "whmi-wri", 8) == 0) {      // whmi-wri and whmi-wris
        long b = field(line, 1);
        transferring = true;
        switchBaud(b);
      } else if (strncmp(line, "baud=", 5) == 0) {
        switchBaud(atol(line + 5));
      }
      len = 0;
      ffRun = 0;
    }
    return;
  }
  ffRun = 0;
  if (len < sizeof(line) - 1) line[len++] = (char)c;
}

void setup() {
  Serial.begin(USB_BAUD);
  Serial1.begin(nexBaud);
}

void loop() {
  while (Serial.available()) {
    uint8_t c = Serial.read();
    Serial1.write(c);
    watch(c);
  }
  while (Serial1.available()) Serial.write(Serial1.read());
}
