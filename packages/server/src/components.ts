/** Look up one component's attributes in guide/components.md, so Claude never has to read the whole 60 KB file. */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";

interface Section {
  heading: string;
  keys: string[];
  body: string;
}

let sections: Section[] | null = null;

/** Split components.md into one section per component, keyed by label, objtype, prefix and editor name. */
export function parseComponents(md: string): Section[] {
  const out: Section[] = [];
  // the editor's internal names (`text`, `button_t`, `OBJECT_TYPE_SLIDER`) live in the summary table
  const internal = new Map<string, string>();
  for (const m of md.matchAll(/^\| (\d+) \| [^|]*\(`([^`]+)`\) \|/gm)) internal.set(m[1]!, m[2]!.toLowerCase());
  for (const chunk of md.split(/^## /m).slice(1)) {
    const nl = chunk.indexOf("\n");
    const heading = chunk.slice(0, nl).trim();
    const m = /^(.*?) \(objtype (\d+), prefix `([^`]+)`\)/.exec(heading);
    if (!m) continue;
    const label = m[1]!.toLowerCase();
    const keys = [label, ...label.split(/[\s()]+/).filter(Boolean), m[2]!, m[3]!.toLowerCase(), internal.get(m[2]!) ?? ""].filter(Boolean);
    // table rows only, compacted: "`sta` Select 1 0..3 no 背景…" reads the same and costs fewer tokens
    const rows = chunk
      .slice(nl + 1)
      .split("\n")
      .filter((l) => l.startsWith("| `"))
      .map((l) => l.replace(/^\| /, "").replace(/ \|$/, "").split(" | ").join(" "));
    out.push({ heading, keys, body: rows.join("\n") });
  }
  return out;
}

/** Short aliases the guide uses for hmi.txt "obj" names. */
const ALIASES: Record<string, string> = { float: "59", xfloat: "59", progress: "106", dsbutton: "53", switch: "67", radio: "57", scrolltext: "62", hotspot: "109", picture: "112", crop: "113" };

export function componentInfo(query: string, md?: string): string {
  if (md) sections = parseComponents(md);
  sections ??= parseComponents(fs.readFileSync(path.join(config.serverRoot, "guide", "components.md"), "utf8"));
  const q = query.trim().toLowerCase();
  const key = ALIASES[q] ?? q;
  const hits = sections.filter((s) => s.keys.includes(key));
  if (!hits.length) return `No component "${query}". Known: ${sections.map((s) => s.keys[0]).join(", ")}`;
  const s = hits[0]!;
  return `${s.heading}\nColumns: attribute type default range runtime-settable description. Common to all: objname vscope x y w h.\n${s.body}`;
}
