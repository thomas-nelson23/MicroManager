/** Approximate rendering of one Nextion page from hmi.txt (positions, colors, text, values). */
import type { CSSProperties } from "react";
import { type HmiObject, type HmiPage, rgb565 } from "../hmi.ts";

interface Props {
  page: HmiPage;
  width: number;
  height: number;
  fonts: { index: number; height: number }[];
  /** Rendered width in CSS px; the screen scales to fit. */
  displayWidth: number;
}

const INVISIBLE = new Set([51, 52, 109]); // timer, variable, hotspot

export function NexPreview({ page, width, height, fonts, displayWidth }: Props) {
  const scale = displayWidth / width;
  const pageBg = page.page.num("sta", 1) === 1 ? rgb565(page.page.num("bco", 65535)) : "#000";
  return (
    <div
      className="nexpreview"
      style={{ width: displayWidth, height: Math.round(height * scale) }}
      role="img"
      aria-label={`Preview of screen page ${page.name}`}
    >
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "0 0", background: pageBg, position: "relative", overflow: "hidden" }}>
        {page.objects.filter((o) => !INVISIBLE.has(o.type)).map((o, i) => (
          <Obj key={`${o.name}-${i}`} o={o} fonts={fonts} />
        ))}
      </div>
    </div>
  );
}

function fontPx(o: HmiObject, fonts: Props["fonts"]): number {
  const f = fonts.find((x) => x.index === o.num("font", 0));
  return f?.height ?? 16;
}

function Obj({ o, fonts }: { o: HmiObject; fonts: Props["fonts"] }) {
  const box: CSSProperties = { position: "absolute", left: o.num("x"), top: o.num("y"), width: o.num("w", 100), height: o.num("h", 30), boxSizing: "border-box" };
  const solid = o.num("sta", 1) === 1;
  const bg = solid ? rgb565(o.num("bco", 65535)) : "transparent";
  const fg = rgb565(o.num("pco", 0));
  switch (o.type) {
    case 116: // text
    case 98: // button
    case 53: // dual-state button
    case 54: // number
    case 59: // xfloat
    case 62: { // scrolling text
      let label = o.get("txt") ?? "";
      if (o.type === 54) label = String(o.num("val"));
      if (o.type === 59) {
        const v = o.num("val");
        const dec = o.num("ws1", 1);
        label = (v / 10 ** dec).toFixed(dec);
      }
      const xcen = o.num("xcen", 1);
      const ycen = o.num("ycen", 1);
      const border = o.type === 98 || o.type === 53 ? "1px solid rgba(0,0,0,.35)" : undefined;
      return (
        <div
          style={{
            ...box,
            background: bg,
            color: fg,
            display: "flex",
            alignItems: ycen === 0 ? "flex-start" : ycen === 2 ? "flex-end" : "center",
            justifyContent: xcen === 0 ? "flex-start" : xcen === 2 ? "flex-end" : "center",
            textAlign: xcen === 0 ? "left" : xcen === 2 ? "right" : "center",
            font: `bold ${Math.round(fontPx(o, fonts) * 0.82)}px/1.15 Arial, Helvetica, sans-serif`,
            whiteSpace: o.num("isbr", 0) === 1 ? "pre-wrap" : "pre",
            overflow: "hidden",
            padding: "0 2px",
            border,
          }}
        >
          {label.replace(/\\r/g, "\n")}
        </div>
      );
    }
    case 106: { // progress bar
      const val = Math.max(0, Math.min(100, o.num("val", 50)));
      const vertical = o.num("dez", 0) === 1;
      return (
        <div style={{ ...box, background: rgb565(o.num("bco", 48631)) }}>
          <div style={{ background: rgb565(o.num("pco", 1024)), width: vertical ? "100%" : `${val}%`, height: vertical ? `${val}%` : "100%", position: "absolute", bottom: 0, left: 0 }} />
        </div>
      );
    }
    case 1: { // slider
      const min = o.num("minval", 0);
      const max = o.num("maxval", 100);
      const pos = max > min ? (o.num("val", 50) - min) / (max - min) : 0;
      const h = o.num("h", 30);
      return (
        <div style={{ ...box }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: h / 2 - 3, height: 6, background: rgb565(o.num("bco", 1024)) }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, width: 10, left: `calc(${pos * 100}% - 5px)`, background: rgb565(o.num("pco", 16384)) }} />
        </div>
      );
    }
    case 122: { // gauge
      const val = o.num("val", 0);
      const w = o.num("w", 100);
      const hgt = o.num("h", 100);
      const r = Math.min(w, hgt) / 2 - 2;
      const a = ((val - 90) * Math.PI) / 180;
      return (
        <svg style={box} viewBox={`0 0 ${w} ${hgt}`} aria-hidden="true">
          <circle cx={w / 2} cy={hgt / 2} r={r} fill={bg} stroke="rgba(0,0,0,.3)" />
          <line x1={w / 2} y1={hgt / 2} x2={w / 2 + Math.cos(a) * r * 0.85} y2={hgt / 2 + Math.sin(a) * r * 0.85} stroke={fg} strokeWidth={3} />
        </svg>
      );
    }
    case 56: // checkbox
    case 57: { // radio
      const on = o.num("val", 1) === 1;
      return (
        <div style={{ ...box, background: rgb565(o.num("bco", 65535)), border: "2px solid #444", borderRadius: o.type === 57 ? "50%" : 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {on && <div style={{ width: "55%", height: "55%", background: fg, borderRadius: o.type === 57 ? "50%" : 0 }} />}
        </div>
      );
    }
    case 67: { // switch
      const on = o.num("val", 0) === 1;
      return (
        <div style={{ ...box, background: rgb565(on ? o.num("bco2", 1024) : o.num("bco", 50712)), borderRadius: 999 }}>
          <div style={{ position: "absolute", top: 3, bottom: 3, aspectRatio: "1", left: on ? undefined : 3, right: on ? 3 : undefined, background: "#fff", borderRadius: "50%" }} />
        </div>
      );
    }
    case 112: // picture
    case 113: // crop
    case 58: // QR
    case 0: // waveform
    default: {
      const label = o.type === 112 || o.type === 113 ? `picture ${o.get("pic") ?? o.get("picc") ?? ""}` : o.typeName;
      return (
        <div style={{ ...box, background: o.type === 0 ? bg : "rgba(128,128,128,.25)", border: "1px dashed rgba(255,255,255,.45)", color: "#fff", font: "11px Arial, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {label}
        </div>
      );
    }
  }
}
