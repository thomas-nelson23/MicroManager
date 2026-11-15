// Spike: proves a flash really changed the program. Prints a banner on USB serial every 500 ms.
void setup() { Serial.begin(115200); pinMode(LED_BUILTIN, OUTPUT); }
void loop() { Serial.println("HELLO-FLASH 1"); digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN)); delay(500); }
