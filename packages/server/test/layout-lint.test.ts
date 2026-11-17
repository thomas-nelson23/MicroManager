import { expect, it } from "vitest";
import { lintLayout } from "../src/layout-lint.ts";

const fonts = [{ index: 0, height: 24 }, { index: 1, height: 48 }];
const hmi = (lines: string[]) => `[\n{"dire": "0"},\n{"page": "main"},\n${lines.join(",\n")}\n]`;

it("passes a tidy layout", () => {
  expect(lintLayout(hmi([`{"obj": "text", "name": "t0", "x": 0, "y": 0, "w": 480, "h": 50, "font": 1, "txt": "Dashboard", "txt_maxl": 20, "bco": 0, "pco": 65535}`]), 480, 272, fonts)).toEqual([]);
});

it("finds off-screen, cut-off text, small boxes, low contrast and partial overlaps", () => {
  const out = lintLayout(
    hmi([
      `{"obj": "button", "name": "b0", "x": 400, "y": 10, "w": 120, "h": 40, "txt": "Go"}`,
      `{"obj": "text", "name": "t0", "x": 0, "y": 60, "w": 100, "h": 40, "txt": "Temperature", "txt_maxl": 20}`,
      `{"obj": "text", "name": "t1", "x": 0, "y": 120, "w": 300, "h": 30, "font": 1, "txt": "Hi"}`,
      `{"obj": "text", "name": "t2", "x": 0, "y": 200, "w": 300, "h": 40, "txt": "x", "pco": 50712, "bco": 65535}`,
      `{"obj": "button", "name": "b1", "x": 50, "y": 70, "w": 100, "h": 40, "txt": "A"}`,
    ]),
    480,
    272,
    fonts,
  );
  expect(out.join("\n")).toMatch(/main\.b0 goes off/);
  expect(out.join("\n")).toMatch(/main\.t0: "Temperature" is about \d+ px wide in a 100 px box/);
  expect(out.join("\n")).toMatch(/main\.t1: font 1 is 48 px tall/);
  expect(out.join("\n")).toMatch(/main\.t2: text and background colors/);
  expect(out.join("\n")).toMatch(/t0 and b1 overlap/);
});
