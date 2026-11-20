import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { boardById, findPins, isPiBoard } from "../src/boards.ts";
import { buildPiProgram, validPiHost } from "../src/pi.ts";
import { checkWiring, parseWiring, sketchPins } from "../src/wiring.ts";

const pi = boardById("rpi4")!;
const here = path.dirname(new URL(import.meta.url).pathname);

describe("Raspberry Pi 4 board", () => {
  it("has the 40-pin header, by BCM name and physical position", () => {
    expect(pi.pins).toHaveLength(40);
    expect(isPiBoard(pi.fqbn)).toBe(true);
    expect(isPiBoard("rp2040:rp2040:rpipico")).toBe(false);
    expect(pi.pins[findPins(pi, "17")[0]!]!.name).toBe("GPIO17");
    expect(pi.pins[findPins(pi, "PIN8")[0]!]!.name).toBe("GPIO14");
    expect(pi.pins[findPins(pi, "PIN1")[0]!]!.name).toBe("3V3");
    expect(findPins(pi, "GND")).toHaveLength(8);
    expect(findPins(pi, "5V")).toHaveLength(2);
    // pin 1 at the top of the left (odd) column, pin 2 at the top of the right one
    expect(pi.pins.filter((p) => p.side === "L")[0]!.name).toBe("3V3");
    expect(pi.pins.filter((p) => p.side === "R")[0]!.name).toBe("5V");
  });

  it("its stock wiring is clean", () => {
    const { wiring } = parseWiring(fs.readFileSync(path.join(here, "..", "boards", "rpi4", "wiring.json"), "utf8"));
    expect(checkWiring(pi, wiring).filter((i) => i.level !== "info")).toEqual([]);
  });

  it("finds pins a Python program uses", () => {
    const src = ["from gpiozero import LED, Button", "BUTTON_PIN = 27  # the button", "led = LED(17)", "btn = Button(BUTTON_PIN, pull_up=True)", "servo = gpiozero.Servo(pin=12)", "# LED(5) is a comment", "GPIO.setup(22, GPIO.OUT)"].join("\n");
    const found = sketchPins(src, pi).map((p) => `${pi.pins[p.index]!.name}@${p.line}`);
    expect(found.sort()).toEqual(["GPIO12@5", "GPIO17@3", "GPIO22@7", "GPIO27@4"].sort());
  });

  it("accepts only plain user@host addresses", () => {
    expect(validPiHost("pi@raspberrypi.local")).toBe(true);
    expect(validPiHost("10.1.1.50")).toBe(true);
    expect(validPiHost("-oProxyCommand=x")).toBe(false);
    expect(validPiHost("pi@host;rm")).toBe(false);
    expect(validPiHost("pi@host name")).toBe(false);
  });
});

describe("Pi program builds", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pibuild-"));

  it("packs a program that compiles, with the current nexpass.py", async () => {
    const src = tmp();
    fs.copyFileSync(path.join(here, "..", "template-pi", "main.py"), path.join(src, "main.py"));
    const out = path.join(tmp(), "program.tar.gz");
    const r = await buildPiProgram(src, out);
    expect(r.ok).toBe(true);
    const list = execFileSync("tar", ["-tzf", out], { encoding: "utf8" });
    expect(list).toContain("./main.py");
    expect(list).toContain("./nexpass.py");
  });

  it("reports a syntax error with file and line", async () => {
    const src = tmp();
    fs.writeFileSync(path.join(src, "main.py"), "import time\nwhile True\n    pass\n");
    const r = await buildPiProgram(src, path.join(tmp(), "program.tar.gz"));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/pi\/main\.py:2:/);
  });

  it("says so when main.py is missing", async () => {
    const r = await buildPiProgram(tmp(), path.join(tmp(), "x.tgz"));
    expect(r).toMatchObject({ ok: false, error: "pi/main.py is missing" });
  });
});

describe("nexpass.py", () => {
  it("decodes display messages like the browser does", () => {
    const code = `
import sys, json, types
sys.modules["serial"] = types.ModuleType("serial")
sys.path.insert(0, sys.argv[1])
import nexpass
print(json.dumps([nexpass.decode(bytes.fromhex(h)) for h in sys.argv[2:]]))`;
    const r = spawnSync("python3", ["-I", "-c", code, path.join(here, "..", "pi"), "7048656c6c6f", "712a000000", "65000301", "6601", "1a", "aabb"], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { string: "Hello" },
      { number: 42 },
      { touch: { page: 0, component: 3, event: "press" } },
      { page: 1 },
      { code: "0x1a", meaning: "invalid variable name" },
      { raw: "aa bb" },
    ]);
  });
});
