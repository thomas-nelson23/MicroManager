import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compactReplies, freshReason, splitGuide } from "../src/chat.ts";
import { componentInfo } from "../src/components.ts";

const guideMd = fs.readFileSync(path.join(import.meta.dirname, "..", "guide", "GUIDE.md"), "utf8");

describe("component_info", () => {
  it("finds components by hmi.txt name, objtype and prefix", () => {
    expect(componentInfo("slider").split("\n")[0]).toBe("slider (objtype 1, prefix `h`)");
    expect(componentInfo("122").split("\n")[0]).toMatch(/^gauge/);
    expect(componentInfo("bt").split("\n")[0]).toMatch(/^dual-state button/);
    expect(componentInfo("dsbutton").split("\n")[0]).toMatch(/^dual-state button/);
    expect(componentInfo("float").split("\n")[0]).toMatch(/^float number/);
  });
  it("returns compact rows, far smaller than the reference", () => {
    const r = componentInfo("button");
    expect(r).toContain("`bco2` Color 1024");
    expect(r).not.toContain("|");
    expect(r.length).toBeLessThan(2000);
  });
  it("lists known types for an unknown one", () => {
    expect(componentInfo("blinkenlight")).toMatch(/^No component "blinkenlight". Known: page, text, button/);
  });
});

describe("guide", () => {
  it("splits board notes off the shared part", () => {
    const { guide, boards } = splitGuide(guideMd);
    expect([...boards.keys()]).toEqual(["arduino:megaavr:nona4809", "teensy:avr:teensy41", "rp2040:rp2040:rpipico"]);
    expect(boards.get("teensy:avr:teensy41")).toMatch(/not\s+5 V tolerant/);
    expect(guide).not.toContain("### board:");
    expect(guide).not.toContain("<!--");
    expect(guide.length).toBeLessThan(11_000);
  });
});

describe("display replies", () => {
  it("are one short line per command", () => {
    const out = compactReplies(
      ["get t0.txt", "get n0.val", "t9.txt=1", "page 0"],
      [
        { cmd: "get t0.txt", reply: [{ string: "Hello" }] },
        { cmd: "get n0.val", reply: [{ number: 42 }] },
        { cmd: "t9.txt=1", reply: [{ code: "0x1a", meaning: "invalid variable name" }] },
        { cmd: "page 0", reply: [] },
        { events: [{ touch: { page: 0, component: 3, event: "press" } }] },
      ],
    );
    expect(out).toBe('get t0.txt → "Hello"\nget n0.val → 42\nt9.txt=1 → 0x1a invalid variable name\npage 0 → ok\nevents: touch 0.3 press');
  });
});

describe("fresh sessions", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  it("resumes a recent, small session", () => {
    expect(freshReason({ sessionId: "s", sessionAt: "2026-11-17T11:30:00Z", sessionContext: 20_000 }, now)).toBeUndefined();
  });
  it("starts over after a break, when it got long, or for a session from before the lean setup", () => {
    expect(freshReason({ sessionId: "s", sessionAt: "2026-11-17T08:00:00Z", sessionContext: 20_000 }, now)).toBe("after a break");
    expect(freshReason({ sessionId: "s", sessionAt: "2026-11-17T11:59:00Z", sessionContext: 90_000 }, now)).toBe("because the last one got long");
    expect(freshReason({ sessionId: "s" }, now)).toBe("with the leaner setup");
  });
  it("has nothing to do without a session", () => {
    expect(freshReason({}, now)).toBeUndefined();
  });
});
