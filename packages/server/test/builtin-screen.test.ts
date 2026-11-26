import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let projects: typeof import("../src/projects.ts");
let boards: typeof import("../src/boards.ts");
beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "mm-screen-"));
  projects = await import("../src/projects.ts");
  boards = await import("../src/boards.ts");
});

describe("boards with a built-in screen", () => {
  it("start with the LVGL sketch and Screen.h, no Nextion files", async () => {
    const meta = await projects.createProject("Yellow", "", "cyd-2432s028r");
    const dir = projects.projectDir(meta.id);
    expect(meta.display).toEqual({ series: "Built-in", model: "ESP32-2432S028R", width: 320, height: 240 });
    expect(projects.hasBuiltInScreen(meta)).toBe(true);
    expect(readFileSync(path.join(dir, "sketch", "sketch.ino"), "utf8")).toContain('#include "Screen.h"');
    expect(readFileSync(path.join(dir, "sketch", "Screen.h"), "utf8")).toMatch(/^#define LGFX_ESP32_2432S028 +\/\/ board: set by the app$/m);
    expect(existsSync(path.join(dir, "sketch", "NexPass.h"))).toBe(false);
    expect(existsSync(path.join(dir, "nextion"))).toBe(false);
  });

  it("swap libraries and display when the board changes", async () => {
    const meta = await projects.createProject("Nano first", "", "nano-every");
    const dir = projects.projectDir(meta.id);
    await projects.setBoard(meta, boards.boardById("cyd-2432s028r")!);
    expect(meta.display.series).toBe("Built-in");
    expect(existsSync(path.join(dir, "sketch", "Screen.h"))).toBe(true);
    expect(existsSync(path.join(dir, "sketch", "NexPass.h"))).toBe(false);
    await projects.setBoard(meta, boards.boardById("pico")!);
    expect(meta.display.series).not.toBe("Built-in");
    expect(existsSync(path.join(dir, "sketch", "NexPass.h"))).toBe(true);
    expect(existsSync(path.join(dir, "sketch", "Screen.h"))).toBe(false);
    expect(existsSync(path.join(dir, "nextion", "hmi.txt"))).toBe(true);
  });

  it("fill the board's LovyanGFX define into Screen.h", async () => {
    const b = { ...boards.boardById("cyd-2432s028r")!, screen: { ...boards.boardById("cyd-2432s028r")!.screen!, lgfx: "LGFX_OTHER_BOARD" } };
    expect(await projects.screenHeader(b)).toMatch(/^#define LGFX_OTHER_BOARD +\/\/ board: set by the app$/m);
  });
});
