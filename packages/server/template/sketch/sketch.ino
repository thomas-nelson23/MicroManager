// New project: shows the uptime on the display. Ask Claude to replace this with your project.
#include "NexPass.h"

unsigned long lastUpdate = 0;

void setup() {
  NexPass.begin(Serial1);  // display on TX1/RX1 at 9600
}

void loop() {
  NexPass.poll();
  if (millis() - lastUpdate >= 1000) {
    lastUpdate = millis();
    char buf[40];
    snprintf(buf, sizeof(buf), "tUptime.txt=\"%lu s\"", millis() / 1000);
    NexPass.send(buf);
  }
}
