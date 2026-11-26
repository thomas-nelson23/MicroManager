import { describe, expect, it } from "vitest";
import { BOARDS, boardById, boardByUsb, findPins } from "../src/boards.ts";
import { DISPLAYS, displayByReported } from "../src/displays.ts";
import { applyWiring, checkWiring, formatWiring, parseWiring, remapWiring, sketchPins, stripHardwareTable, wiringFromHardwareMd, wiringLines } from "../src/wiring.ts";
import { retargetHmi } from "../src/hmi-compact.ts";
import { readFileSync } from "node:fs";

const nano = boardById("nano-every")!;
const teensy = boardById("teensy41")!;
const pico = boardById("pico")!;
const propMaker = boardById("feather-rp2040-prop-maker")!;
const esp32 = boardById("esp32-devkitc")!;
const esp32s3 = boardById("esp32s3-devkitc")!;

describe("boards", () => {
  it("has the real pin counts", () => {
    expect(nano.pins).toHaveLength(30);
    expect(teensy.pins).toHaveLength(48);
    expect(pico.pins).toHaveLength(40);
    expect(propMaker.pins).toHaveLength(28);
    expect(esp32.pins).toHaveLength(38);
    expect(esp32s3.pins).toHaveLength(44);
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
    expect(propMaker.pins[findPins(propMaker, "0")[0]!]!.name).toBe("TX");
    expect(propMaker.pins[findPins(propMaker, "26")[0]!]!.name).toBe("A0");
    expect(esp32.pins[findPins(esp32, "GPIO16")[0]!]!.name).toBe("IO16");
    expect(esp32.pins[findPins(esp32, "RX2")[0]!]!.role).toBe("Serial1 RX");
    expect(esp32.pins[findPins(esp32, "D2")[0]!]!.name).toBe("IO2");
    expect(esp32.pins[findPins(esp32, "34")[0]!]!.caps).not.toContain("pwm");
    expect(esp32.pins[findPins(esp32, "GPIO9")[0]!]!.kind).toBe("other");
    expect(findPins(esp32, "GND")).toHaveLength(3);
    expect(esp32s3.pins[findPins(esp32s3, "18")[0]!]!.role).toBe("Serial1 RX");
    expect(findPins(esp32s3, "3V3")).toHaveLength(2);
  });
  it("recognises boards by USB id", () => {
    expect(boardByUsb(0x2341, 0x0058)?.id).toBe("nano-every");
    expect(boardByUsb(0x16c0, 0x0483)?.id).toBe("teensy41");
    expect(boardByUsb(0x2e8a, 0x000a)?.id).toBe("pico");
    expect(boardByUsb(0x239a, 0x8131)?.id).toBe("feather-rp2040-prop-maker");
    expect(boardByUsb(0x10c4, 0xea60)?.id).toBe("esp32-devkitc");
    expect(boardByUsb(0x10c4, 0xea60, esp32s3)?.id).toBe("esp32s3-devkitc");
    expect(boardByUsb(0x2341, 0x0058, esp32s3)?.id).toBe("nano-every");
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

describe("work the container does instead of Claude", () => {
  const w = { connections: [{ pin: "TX1", part: "Nextion display", partPin: "RX", color: "yellow" }, { pin: "5V", part: "Nextion display", partPin: "5V" }, { pin: "D4", part: "IR receiver", partPin: "OUT" }, { pin: "A0", part: "Pot", partPin: "W" }] };
  it("writes wiring.json one wire per line and reads it back", () => {
    const text = formatWiring(w);
    expect(text.split("\n")[2]).toBe('    {"pin": "TX1", "part": "Nextion display", "partPin": "RX", "color": "yellow"},');
    expect(parseWiring(text).wiring).toEqual(w);
    expect(parseWiring(formatWiring({ connections: [] })).wiring.connections).toEqual([]);
  });
  it("adds, replaces and removes wires", () => {
    const moved = applyWiring(w, { set: [{ pin: "D7", part: "IR receiver", partPin: "OUT" }, { pin: "D9", part: "Servo", partPin: "SIG" }], remove: ["pot"] });
    expect(wiringLines(moved)).toBe("TX1 Nextion display RX; 5V Nextion display 5V; D7 IR receiver OUT; D9 Servo SIG");
    expect(applyWiring(w, { remove: ["d4"] }).connections.map((c) => c.part)).not.toContain("IR receiver");
    expect(wiringLines({ connections: [] })).toBe("no wires");
  });
  it("renames pins for another board", () => {
    const t = remapWiring(w, nano, teensy);
    expect(t.connections.map((c) => c.pin)).toEqual(["1", "VIN", "4", "14"]);
    expect(checkWiring(teensy, t).filter((i) => i.level === "error")).toEqual([]);
    expect(remapWiring(t, teensy, nano).connections.map((c) => c.pin)).toEqual(["TX1", "5V", "D4", "A0"]);
    expect(remapWiring({ connections: [{ pin: "33", part: "LED" }] }, teensy, nano).connections[0]!.pin).toBe("33");
    const e = remapWiring(w, nano, esp32);
    expect(e.connections.map((c) => c.pin)).toEqual(["IO17", "5V", "IO4", "IO14"]);
    expect(remapWiring(e, esp32, esp32s3).connections.map((c) => c.pin)).toEqual(["IO17", "5V", "IO4", "IO14"]);
  });
  it("takes the pin table out of hardware.md", () => {
    const md = "# Hardware\n\n| Pin | Goes to |\n|---|---|\n| D4 | IR receiver OUT |\n\nNotes stay.";
    expect(stripHardwareTable(md)).toBe("# Hardware\n\nThe connections are in wiring.json.\n\nNotes stay.");
  });
  it("scales a screen to a new resolution, one line per element", () => {
    const hmi = ['[', '  {"dire": "0", "model": "NX4827P043_011", "ser": "Intelligent"},', '  {"page": "main", "bco": 0},', '  {"obj": "text", "name": "t0", "x": 20, "y": 20, "w": 440, "h": 40, "txt": "x: 5", "on": {"down": "t0.txt=\\"h\\""}},', '  {"obj": "timer", "name": "tm0", "tim": 1000}', ']'].join("\n");
    const out = retargetHmi(hmi, { width: 480, height: 272 }, { width: 800, height: 480 }).split("\n");
    expect(out[1]).toBe('  {"dire": "0"},');
    expect(out[2]).toBe('  {"page": "main", "bco": 0},');
    expect(out[3]).toBe('  {"obj": "text", "name": "t0", "x": 33, "y": 35, "w": 733, "h": 71, "txt": "x: 5", "on": {"down": "t0.txt=\\"h\\""}},');
    expect(out[4]).toBe('  {"obj": "timer", "name": "tm0", "tim": 1000}');
    expect(out.every((l, i) => i === 0 || i === out.length - 1 || JSON.parse(l.replace(/,$/, "")))).toBe(true);
    expect(retargetHmi(hmi, { width: 480, height: 272 }, { width: 480, height: 272 }).split("\n")[3]).toBe(hmi.split("\n")[3]);
  });
});
