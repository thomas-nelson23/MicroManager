import { describe, expect, it } from "vitest";
import { sketchSize } from "../src/builds.ts";

describe("sketchSize", () => {
  it("reads the AVR line", () => {
    expect(sketchSize("Sketch uses 4321 bytes (8%) of program storage space. Maximum is 49152 bytes.")).toEqual({ bytes: 4321, max: 49152 });
  });
  it("reads the RP2040 line", () => {
    expect(sketchSize("Sketch uses 57360 bytes (2%) of program storage space. Maximum is 2093056 bytes.")).toEqual({ bytes: 57360, max: 2093056 });
  });
  it("reads the ESP32 line", () => {
    expect(sketchSize("Sketch uses 289873 bytes (22%) of program storage space. Maximum is 1310720 bytes.\nGlobal variables use 20936 bytes (6%) of dynamic memory")).toEqual({ bytes: 289873, max: 1310720 });
  });
  it("reads the Teensy 4.1 line", () => {
    const out = `Memory Usage on Teensy 4.1:
  FLASH: code:11252, data:4040, headers:8268   free for files:8102904
   RAM1: variables:4832, code:9128, padding:23640   free for local variables:486688
   RAM2: variables:12416  free for malloc/new:511872`;
    expect(sketchSize(out)).toEqual({ bytes: 23560, max: 8126464 });
  });
  it("returns nothing for unknown output", () => {
    expect(sketchSize("done")).toEqual({});
  });
});
