import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let fr: typeof import("../src/feature-requests.ts");
beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "mm-fr-"));
  fr = await import("../src/feature-requests.ts");
});

describe("feature requests", () => {
  it("checks submissions", () => {
    expect(fr.parseFeatureRequest({ title: "  " })).toBe("give the request a title");
    expect(fr.parseFeatureRequest({ title: " ESP32 ", details: " please ", kind: "nope" })).toEqual({ title: "ESP32", details: "please", kind: "feature" });
    expect(fr.parseFeatureRequest({ title: "x".repeat(500), kind: "board" })).toMatchObject({ kind: "board" });
    expect((fr.parseFeatureRequest({ title: "x".repeat(500) }) as { title: string }).title).toHaveLength(120);
  });
  it("saves, marks sent and deletes, newest first", async () => {
    const [a, b] = await Promise.all([
      fr.addFeatureRequest({ title: "A", details: "", kind: "feature" }),
      fr.addFeatureRequest({ title: "B", details: "", kind: "display" }),
    ]);
    expect((await fr.listFeatureRequests()).map((r) => r.title)).toEqual(["B", "A"]);
    expect((await fr.markFeatureRequestSent(a!.id))?.sentAt).toBeTruthy();
    expect(await fr.deleteFeatureRequest(b!.id)).toBe(true);
    expect(await fr.deleteFeatureRequest(b!.id)).toBe(false);
    const left = await fr.listFeatureRequests();
    expect(left).toHaveLength(1);
    expect(left[0]!.sentAt).toBeTruthy();
  });
});
