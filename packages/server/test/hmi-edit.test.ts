import { describe, expect, it } from "vitest";
import { applyAttrChange } from "../src/hmi-edit.ts";

const hmi = `[
  {"dire": "0"},
  {"page": "main", "bco": 0},
  {"obj": "text", "name": "t0", "x": 20, "y": 20, "w": 200, "h": 40, "txt_maxl": 40, "txt": "Hi"},
  {"obj": "button", "name": "b0", "x": 20, "y": 80, "w": 120, "h": 50, "on": {"down": ["prints \\"go\\",0"]}},
  {"page": "setup"},
  {"obj": "button", "name": "b0", "x": 1, "y": 2, "w": 3, "h": 4}
]`;

describe("applyAttrChange", () => {
  it("changes one component's line and nothing else", () => {
    const out = applyAttrChange(hmi, { page: "main", name: "b0", attrs: { bco: "2016", x: 30, txt: "123" } });
    const lines = out.split("\n");
    expect(lines[4]).toBe(`  {"obj": "button", "name": "b0", "x": 30, "y": 80, "w": 120, "h": 50, "bco": 2016, "txt": "123", "on": {"down": ["prints \\"go\\",0"]}},`);
    expect(lines.filter((_, i) => i !== 4)).toEqual(hmi.split("\n").filter((_, i) => i !== 4));
  });

  it("finds components by page, and the page itself without a name", () => {
    const out = applyAttrChange(hmi, { page: "setup", name: "b0", attrs: { w: 99 } });
    expect(out.split("\n")[6]).toContain(`"w": 99`);
    expect(out.split("\n")[4]).toContain(`"w": 120`);
    expect(applyAttrChange(hmi, { page: "main", attrs: { bco: 31 } }).split("\n")[2]).toBe(`  {"page": "main", "bco": 31},`);
  });

  it("removes attributes set to null and refuses reserved keys", () => {
    expect(applyAttrChange(hmi, { page: "main", name: "t0", attrs: { txt_maxl: null } })).not.toContain("txt_maxl");
    expect(() => applyAttrChange(hmi, { page: "main", name: "t0", attrs: { name: "x" } })).toThrow();
  });

  it("explains when the component can't be found on its own line", () => {
    expect(() => applyAttrChange(hmi, { page: "main", name: "nope", attrs: { x: 1 } })).toThrow(/no component nope/);
  });
});

it("asks for the compact format when the component is written as editor commands", () => {
  const old = `[\n{"dire": "0"},\n{"com": "addpage", "pagename": "main"},\n{"com": "addobj", "objtype": "116", "objname": "t0"}\n]`;
  expect(() => applyAttrChange(old, { page: "main", name: "t0", attrs: { x: 1 } })).toThrow(/compact format/);
});
