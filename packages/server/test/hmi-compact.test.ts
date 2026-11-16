import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { expandHmi } from "../src/hmi-compact.ts";

const job = [
  { dire: "0" },
  { page: "main", bco: 0, on: { loadend: ["tm0.en=1", "t0.txt=\"x\""] } },
  { obj: "text", name: "t0", x: 20, y: 20, w: 200, h: 40, txt: "Hello, longer than ten", txt_maxl: 40 },
  { obj: "button", name: "b0", x: 20, y: 80, w: 120, h: 50, on: { down: "prints \"go\",0\nt0.txt=\"go\"" } },
  { obj: 51, name: "tm0", tim: 500, en: 0, on: { timer: "t0.txt=\"tick\"" } },
  { com: "setatt", attname: "0", attval: "0" },
  { com: "setatt", attname: "sta", attval: "1" },
];

describe("expandHmi", () => {
  const cmds = expandHmi(job.slice(1));

  it("turns compact elements into editor commands", () => {
    expect(cmds.slice(0, 3).map((c) => c.cmd)).toEqual([
      { com: "addpage", pagename: "main" },
      { com: "setatt", attname: "bco", attval: "0" },
      { com: "setevent", eventname: "loadend", eventcode: "tm0.en=1\r\nt0.txt=\"x\"" },
    ]);
  });

  it("sets txt_maxl before txt and keeps source positions", () => {
    const t0 = cmds.filter((c) => c.source === 3).map((c) => c.cmd.attname ?? c.cmd.com);
    expect(t0).toEqual(["addobj", "txt_maxl", "x", "y", "w", "h", "txt"]);
  });

  it("resolves type names and numbers, normalises newlines, passes old commands through", () => {
    expect(cmds.find((c) => c.cmd.objname === "b0")?.cmd.objtype).toBe("98");
    expect(cmds.find((c) => c.cmd.objname === "tm0")?.cmd.objtype).toBe("51");
    expect(cmds.find((c) => c.cmd.eventname === "down")?.cmd.eventcode).toBe("prints \"go\",0\r\nt0.txt=\"go\"");
    expect(cmds.at(-1)).toEqual({ cmd: { com: "setatt", attname: "sta", attval: "1" }, source: 7 });
  });

  it("rejects unknown types", () => {
    expect(() => expandHmi([{ obj: "nope", name: "x" }])).toThrow(/unknown obj type/);
  });

  it("matches nxprep.py", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "hmi-"));
    writeFileSync(path.join(dir, "hmi.txt"), JSON.stringify(job));
    writeFileSync(path.join(dir, "star.txt"), "page 0\n");
    const out = path.join(dir, "out.txt");
    execFileSync("python3", ["-I", path.join(import.meta.dirname, "..", "nextion", "nxprep.py"), dir, out, "--jobname", "t", "--jobroot", "C:\\t"]);
    const prepared = JSON.parse(readFileSync(out, "utf8")) as unknown[];
    expect(prepared.slice(1)).toEqual(cmds.map((c) => c.cmd));
  });
});
