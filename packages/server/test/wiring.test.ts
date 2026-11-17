import { describe, expect, it } from "vitest";
import { BOARDS, boardById, boardByUsb, findPins } from "../src/boards.ts";
import { DISPLAYS, displayByReported } from "../src/displays.ts";
import { checkWiring, parseWiring, sketchPins, wiringFromHardwareMd } from "../src/wiring.ts";
import { readFileSync } from "node:fs";

const nano = boardById("nano-every")!;
const teensy = boardById("teensy41")!;
const pico = boardById("pico")!;

describe("boards", () => {
  it("has the real pin counts", () => {
    expect(nano.pins).toHaveLength(30);
    expect(teensy.pins).toHaveLength(48);
    expect(pico.pins).toHaveLength(40);
  });
  it("finds pins by name, alias and hint", () => {
    expect(nano.pins[findPins(nano, "d4")[0]!]!.name).toBe("D4");
    expect(nano.pins[findPins(nano, "4")[0]!]!.name).toBe("D4");
    expect(nano.pins[findPins(nano, "1 (TX1)")[0]!]!.name).toBe("TX1");
    expect(findPins(nano, "GND")).toHaveLength(2);
    expect(findPins(nano, "D99")).toEqual([]);
    expect(teensy.pins[findPins(teensy, "A0")[0]!]!.name).toBe("14");
    expect(pico.pins[findPins(pico, "A0")[0]!]!.name).toBe("GP26");
    expect(pico.pins[findPins(pico, "4")[0]!]!.role).toBe("SDA");
    expect(findPins(pico, "GND")).toHaveLength(7);
  });
  it("recognises boards by USB id", () => {
    expect(boardByUsb(0x2341, 0x0058)?.id).toBe("nano-every");
    expect(boardByUsb(0x16c0, 0x0483)?.id).toBe("teensy41");
    expect(boardByUsb(0x2e8a, 0x000a)?.id).toBe("pico");
    expect(boardByUsb(0x1234, 1)).toBeUndefined();
    expect(boardByUsb()).toBeUndefined();
  });
  it("ships a starting wiring for every board that only uses real pins", () => {
    for (const b of BOARDS) {
      const { wiring, error } = parseWiring(readFileSync(new URL(`../boards/${b.id}/wiring.json`, import.meta.url), "utf8"));
      expect(error).toBeUndefined();
      expect(wiring.connections.length).toBeGreaterThan(0);
      expect(checkWiring(b, wiring).filter((i) => i.level === "error")).toEqual([]);
    }
  });
});

describe("displays", () => {
  it("has unique models", () => {
    expect(new Set(DISPLAYS.map((d) => d.model)).size).toBe(DISPLAYS.length);
  });
  it("matches what a display reports", () => {
    expect(displayByReported("NX4827P043_011R")?.model).toBe("NX4827P043_011");
    expect(displayByReported("TJC4827")).toBeUndefined();
  });
});

describe("parseWiring", () => {
  it("reads connections and drops bad entries", () => {
    const { wiring, error } = parseWiring(JSON.stringify({ connections: [{ pin: "D4", part: "IR receiver", partPin: "OUT", color: "green" }, { pin: "D5" }, "x", { pin: 6, part: "LED" }] }));
    expect(error).toBeUndefined();
    expect(wiring.connections).toEqual([{ pin: "D4", part: "IR receiver", partPin: "OUT", color: "green" }, { pin: "6", part: "LED" }]);
  });
  it("accepts a bare list and an empty file", () => {
    expect(parseWiring('[{"pin":"D2","part":"Button"}]').wiring.connections).toHaveLength(1);
    expect(parseWiring("").wiring.connections).toEqual([]);
  });
  it("reports broken JSON and the wrong shape", () => {
    expect(parseWiring("{nope").error).toMatch(/not valid JSON/);
    expect(parseWiring('{"wires":[]}').error).toMatch(/connections/);
  });
});

describe("wiringFromHardwareMd", () => {
  it("reads the old pin table", () => {
    const md = "# Hardware\n\n| Pin | Goes to |\n|---|---|\n| TX1 | Nextion RX (yellow) |\n| D4 | IR receiver OUT |\n| 5V | Relay |\n\nNotes.";
    expect(wiringFromHardwareMd(md).connections).toEqual([
      { pin: "TX1", part: "Nextion", partPin: "RX", color: "yellow" },
      { pin: "D4", part: "IR receiver", partPin: "OUT" },
      { pin: "5V", part: "Relay" },
    ]);
  });
  it("gives nothing without a table", () => {
    expect(wiringFromHardwareMd("just notes").connections).toEqual([]);
  });
});

describe("sketchPins", () => {
  const names = (src: string, b = nano) => sketchPins(src, b).map((p) => b.pins[p.index]!.name);
  it("finds literal pins, constants and defines", () => {
    const src = "const int IR_PIN = 4;\n#define LED 6\nvoid setup() {\n  pinMode(LED, OUTPUT);\n  IrReceiver.begin(IR_PIN);\n  analogRead(A0);\n  digitalWrite(13, HIGH);\n}";
    expect(names(src).sort()).toEqual(["A0", "D13", "D4", "D6"]);
    expect(sketchPins(src, nano).find((p) => p.as === "IR_PIN")?.line).toBe(5);
  });
  it("ignores comments and non-pin numbers", () => {
    expect(names("// pinMode(7, OUTPUT);\n/* digitalWrite(8, 1); */\nSerial1.begin(9600);\nconst int COUNT = 5;")).toEqual([]);
  });
});

describe("checkWiring", () => {
  const texts = (issues: { text: string }[]) => issues.map((i) => i.text).join("\n");
  it("flags a pin the board doesn't have", () => {
    const out = checkWiring(nano, { connections: [{ pin: "D40", part: "LED" }] });
    expect(out[0]!.level).toBe("error");
    expect(out[0]!.text).toMatch(/no pin called D40/);
  });
  it("flags two parts on one pin, but not two wires of one part", () => {
    expect(texts(checkWiring(nano, { connections: [{ pin: "D4", part: "IR receiver" }, { pin: "4", part: "Button" }] }))).toMatch(/2 parts/);
    expect(checkWiring(nano, { connections: [{ pin: "GND", part: "A" }, { pin: "GND", part: "B" }] })).toEqual([]);
  });
  it("flags a servo on a pin without PWM", () => {
    expect(texts(checkWiring(nano, { connections: [{ pin: "D8", part: "Servo", partPin: "SIG" }] }))).toMatch(/PWM/);
    expect(checkWiring(nano, { connections: [{ pin: "D9", part: "Servo", partPin: "SIG" }] })).toEqual([]);
  });
  it("flags I2C on the wrong pins", () => {
    expect(texts(checkWiring(nano, { connections: [{ pin: "A3", part: "BME280", partPin: "SDA" }] }))).toMatch(/not an SDA pin/);
    expect(checkWiring(nano, { connections: [{ pin: "A4", part: "BME280", partPin: "SDA" }] })).toEqual([]);
  });
  it("flags 5 V signals into a Teensy only", () => {
    const w = { connections: [{ pin: "2", part: "Sensor", partPin: "OUT", signal: "5V" }] };
    expect(texts(checkWiring(teensy, w))).toMatch(/not 5 V tolerant/);
    expect(texts(checkWiring(pico, { connections: [{ ...w.connections[0]!, pin: "GP2" }] }))).toMatch(/not 5 V tolerant/);
    expect(checkWiring(nano, w)).toEqual([]);
  });
  it("compares the wiring with the sketch", () => {
    const w = { connections: [{ pin: "D4", part: "IR receiver", partPin: "OUT" }, { pin: "TX1", part: "Nextion display", partPin: "RX" }] };
    expect(checkWiring(nano, w, "pinMode(4, INPUT);")).toEqual([]);
    const out = checkWiring(nano, w, "pinMode(6, OUTPUT);");
    expect(out.map((i) => i.level)).toEqual(["warn", "info"]);
    expect(out[0]!.pin).toBe("D6");
    expect(out[1]!.pin).toBe("D4");
  });
});
