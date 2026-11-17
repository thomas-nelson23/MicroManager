/**
 * Layout problems the container can spot in hmi.txt without Claude looking at a picture: components off
 * the screen, partly overlapping, text too big for its box, and text that's hard to read. check_screen and
 * ship append these as short warnings, so Claude fixes them before a build without spending an image.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { type HmiObject, parseHmi } from "./hmi-model.ts";
import { projectDir } from "./projects.ts";

/** Font index -> pixel height, from byte 7 of each nextion/font/N.zi header. */
export async function projectFonts(projectId: string): Promise<{ index: number; height: number }[]> {
  const dir = path.join(projectDir(projectId), "nextion", "font");
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const fonts: { index: number; height: number }[] = [];
  for (const n of names) {
    const m = /^(\d+)\.zi$/.exec(n);
    if (!m) continue;
    const head = await fs.readFile(path.join(dir, n)).then((b) => b.subarray(0, 8), () => null);
    if (head && head.length === 8) fonts.push({ index: Number(m[1]), height: head[7]! });
  }
  return fonts.sort((a, b) => a.index - b.index);
}

const INVISIBLE = new Set([51, 52, 109]); // timer, variable, hotspot
const TEXTUAL = new Set([116, 98, 53, 54, 59, 62]);
const MAX_LINES = 8;

function luminance(v: number): number {
  const ch = [((v >> 11) & 0x1f) / 31, ((v >> 5) & 0x3f) / 63, (v & 0x1f) / 31].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
const contrast = (a: number, b: number) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const box = (o: HmiObject) => ({ x: o.num("x"), y: o.num("y"), w: o.num("w", 100), h: o.num("h", 30) });

/** One line per problem (at most a handful), or [] when the layout looks fine. */
export function lintLayout(hmiText: string, width: number, height: number, fonts: { index: number; height: number }[]): string[] {
  const hmi = parseHmi(hmiText);
  if (hmi.error) return [];
  const out: string[] = [];
  for (const page of hmi.pages) {
    const objs = page.objects.filter((o) => !INVISIBLE.has(o.type));
    for (const o of objs) {
      const b = box(o);
      const at = `${page.name}.${o.name}`;
      if (b.x < 0 || b.y < 0 || b.x + b.w > width || b.y + b.h > height) out.push(`${at} goes off the ${width}×${height} screen (x ${b.x}, y ${b.y}, w ${b.w}, h ${b.h})`);
      if (!TEXTUAL.has(o.type)) continue;
      const fh = fonts.find((f) => f.index === o.num("font", 0))?.height ?? 24;
      if (fh > b.h) out.push(`${at}: font ${o.num("font", 0)} is ${fh} px tall, the box only ${b.h} px`);
      const txt = o.type === 54 || o.type === 59 ? String(o.get("val") ?? "") : (o.get("txt") ?? "");
      // Arial bold averages ~0.55 of the font height per character
      const wide = Math.round(txt.replace(/\\r/g, "").length * fh * 0.55);
      if (o.num("isbr", 0) !== 1 && wide > b.w + 4) out.push(`${at}: "${txt.slice(0, 20)}${txt.length > 20 ? "…" : ""}" is about ${wide} px wide in a ${b.w} px box (cut off)`);
      if (o.num("sta", 1) === 1 && contrast(o.num("pco", 0), o.num("bco", 65535)) < 2.5) out.push(`${at}: text and background colors are too close to read`);
    }
    // partial overlaps (one box fully inside another is a deliberate panel, not a problem)
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        const a = box(objs[i]!), b = box(objs[j]!);
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ix <= 2 || iy <= 2) continue;
        const inside = (p: typeof a, q: typeof a) => p.x >= q.x && p.y >= q.y && p.x + p.w <= q.x + q.w && p.y + p.h <= q.y + q.h;
        if (inside(a, b) || inside(b, a)) continue;
        out.push(`${page.name}: ${objs[i]!.name} and ${objs[j]!.name} overlap by ${ix}×${iy} px`);
      }
    }
  }
  return out.length > MAX_LINES ? [...out.slice(0, MAX_LINES), `…and ${out.length - MAX_LINES} more`] : out;
}
