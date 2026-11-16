/** Lucide-style stroke icons (1.5px on a page, per Steeze). Decorative unless given a label. */
const PATHS: Record<string, string[]> = {
  check: ["M20 6 9 17l-5-5"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  zap: ["M13 2 3 14h9l-1 8 10-12h-9l1-8z"],
  chevronLeft: ["m15 18-6-6 6-6"],
  plus: ["M12 5v14", "M5 12h14"],
  plug: ["M12 22v-5", "M9 8V2", "M15 8V2", "M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"],
  chevronDown: ["m6 9 6 6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  more: ["M12 12h.01", "M19 12h.01", "M5 12h.01"],
  image: ["M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z", "M9 9h.01", "m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"],
  download: ["M12 15V3", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5"],
  alert: ["m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3", "M12 9v4", "M12 17h.01"],
  search: ["m21 21-4.3-4.3", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"],
  chat: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"],
  refresh: ["M3 12a9 9 0 0 1 15-6.7L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15 6.7L3 16", "M8 16H3v5"],
};

export function Icon({ name, label }: { name: keyof typeof PATHS | string; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      {(PATHS[name] ?? []).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
