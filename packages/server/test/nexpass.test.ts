import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// NexPass.h compiled for the PC against a fake Arduino API (test/nexpass/), then run.
const here = path.dirname(fileURLToPath(import.meta.url));
const hasGpp = spawnSync("g++", ["--version"]).status === 0;

it.skipIf(!hasGpp)("NexPass request channel and passthrough behave", () => {
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), "nexpass-")), "nexpass_test");
  execFileSync("g++", ["-std=gnu++11", "-Wall", "-Werror", "-I", path.join(here, "nexpass"), "-o", out, path.join(here, "nexpass", "nexpass_test.cpp")]);
  const r = spawnSync(out, { encoding: "utf8" });
  expect(r.stdout.trim()).toBe("ok");
  expect(r.status).toBe(0);
});
