/**
 * The boards a project can target: how each is built and flashed, and its pins (for the wiring view
 * and the wiring checks). Pure data, shared with the web UI.
 */

export type PinCap = "digital" | "analog" | "pwm" | "interrupt" | "i2c" | "spi" | "serial";

export interface BoardPin {
  /** The label printed on the board, and the name wiring uses ("D4", "TX1", "5V"). */
  name: string;
  /** Other spellings a sketch or a person may use ("4", "RX0"). */
  aliases?: string[];
  kind: "io" | "power" | "gnd" | "other";
  caps: PinCap[];
  /** Which edge of the board it sits on, seen from above with the USB socket at the top. */
  side: "L" | "R";
  /** A short role, e.g. "SDA", "LED", "Serial1 TX". */
  role?: string;
}

export interface Board {
  id: string;
  fqbn: string;
  name: string;
  /** How the browser flashes it: UPDI over Web Serial, or Teensy HalfKay over WebHID. */
  flasher: "nano-every" | "teensy";
  /** Logic level of the I/O pins, in volts. */
  volts: number;
  /** True when a pin survives a 5 V signal. */
  fiveVoltTolerant: boolean;
  flashKb: number;
  /** USB ids of the board's serial port, to recognise what is plugged in. */
  usb: { vendorId: number; productId?: number }[];
  /** Pins in physical order, top to bottom on each side. */
  pins: BoardPin[];
}

const io = (name: string, side: "L" | "R", caps: PinCap[], extra: Partial<BoardPin> = {}): BoardPin => ({ name, side, kind: "io", caps: ["digital", "interrupt", ...caps], ...extra });
const fixed = (name: string, side: "L" | "R", kind: BoardPin["kind"], aliases?: string[]): BoardPin => ({ name, side, kind, caps: [], ...(aliases ? { aliases } : {}) });

const NANO_EVERY_PINS: BoardPin[] = [
  io("D13", "L", ["spi"], { aliases: ["13", "SCK", "LED_BUILTIN"], role: "SCK, LED" }),
  fixed("3V3", "L", "power", ["3.3V"]),
  fixed("AREF", "L", "other"),
  io("A0", "L", ["analog"], { aliases: ["D14", "14"] }),
  io("A1", "L", ["analog"], { aliases: ["D15", "15"] }),
  io("A2", "L", ["analog"], { aliases: ["D16", "16"] }),
  io("A3", "L", ["analog"], { aliases: ["D17", "17"] }),
  io("A4", "L", ["analog", "i2c"], { aliases: ["D18", "18", "SDA"], role: "SDA" }),
  io("A5", "L", ["analog", "i2c"], { aliases: ["D19", "19", "SCL"], role: "SCL" }),
  io("A6", "L", ["analog"], { aliases: ["D20", "20"] }),
  io("A7", "L", ["analog"], { aliases: ["D21", "21"] }),
  fixed("5V", "L", "power"),
  fixed("RST", "L", "other", ["RESET"]),
  fixed("GND", "L", "gnd"),
  fixed("VIN", "L", "power"),
  io("D12", "R", ["spi"], { aliases: ["12", "MISO"], role: "MISO" }),
  io("D11", "R", ["spi"], { aliases: ["11", "MOSI"], role: "MOSI" }),
  io("D10", "R", ["pwm"], { aliases: ["10"] }),
  io("D9", "R", ["pwm"], { aliases: ["9"] }),
  io("D8", "R", [], { aliases: ["8"] }),
  io("D7", "R", [], { aliases: ["7"] }),
  io("D6", "R", ["pwm"], { aliases: ["6"] }),
  io("D5", "R", ["pwm"], { aliases: ["5"] }),
  io("D4", "R", [], { aliases: ["4"] }),
  io("D3", "R", ["pwm"], { aliases: ["3"] }),
  io("D2", "R", [], { aliases: ["2"] }),
  fixed("GND", "R", "gnd"),
  fixed("RST", "R", "other", ["RESET"]),
  io("RX1", "R", ["serial"], { aliases: ["D0", "0", "RX", "RX0"], role: "Serial1 RX" }),
  io("TX1", "R", ["serial"], { aliases: ["D1", "1", "TX"], role: "Serial1 TX" }),
];

const T41_PWM = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19, 22, 23, 24, 25, 28, 29, 33, 36, 37]);
const T41_ANALOG: Record<number, string> = { 14: "A0", 15: "A1", 16: "A2", 17: "A3", 18: "A4", 19: "A5", 20: "A6", 21: "A7", 22: "A8", 23: "A9", 24: "A10", 25: "A11", 26: "A12", 27: "A13", 38: "A14", 39: "A15", 40: "A16", 41: "A17" };
const T41_ROLE: Record<number, string> = {
  0: "Serial1 RX", 1: "Serial1 TX", 7: "Serial2 RX", 8: "Serial2 TX", 10: "CS", 11: "MOSI", 12: "MISO", 13: "SCK, LED",
  14: "Serial3 TX", 15: "Serial3 RX", 16: "Serial4 RX, SCL1", 17: "Serial4 TX, SDA1", 18: "SDA", 19: "SCL",
  20: "Serial5 TX", 21: "Serial5 RX", 24: "Serial6 TX, SCL2", 25: "Serial6 RX, SDA2", 28: "Serial7 RX", 29: "Serial7 TX",
  34: "Serial8 RX", 35: "Serial8 TX",
};
function t41(n: number, side: "L" | "R"): BoardPin {
  const caps: PinCap[] = [];
  if (n in T41_ANALOG) caps.push("analog");
  if (T41_PWM.has(n)) caps.push("pwm");
  const role = T41_ROLE[n];
  if (role?.includes("Serial")) caps.push("serial");
  if (role && /SDA|SCL/.test(role)) caps.push("i2c");
  if ([10, 11, 12, 13].includes(n)) caps.push("spi");
  const aliases = [`D${n}`];
  if (T41_ANALOG[n]) aliases.push(T41_ANALOG[n]!);
  if (n === 0) aliases.push("RX1");
  if (n === 1) aliases.push("TX1");
  if (n === 13) aliases.push("LED_BUILTIN");
  return io(String(n), side, caps, { aliases, ...(role ? { role } : {}) });
}

const TEENSY41_PINS: BoardPin[] = [
  fixed("GND", "L", "gnd"),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => t41(n, "L")),
  fixed("3V3", "L", "power", ["3.3V"]),
  ...[24, 25, 26, 27, 28, 29, 30, 31, 32].map((n) => t41(n, "L")),
  fixed("VIN", "R", "power", ["5V"]),
  fixed("GND", "R", "gnd"),
  fixed("3V3", "R", "power", ["3.3V"]),
  ...[23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13].map((n) => t41(n, "R")),
  fixed("GND", "R", "gnd"),
  ...[41, 40, 39, 38, 37, 36, 35, 34, 33].map((n) => t41(n, "R")),
];

export const BOARDS: Board[] = [
  {
    id: "nano-every",
    fqbn: "arduino:megaavr:nona4809",
    name: "Arduino Nano Every",
    flasher: "nano-every",
    volts: 5,
    fiveVoltTolerant: true,
    flashKb: 48,
    usb: [{ vendorId: 0x2341, productId: 0x0058 }],
    pins: NANO_EVERY_PINS,
  },
  {
    id: "teensy41",
    fqbn: "teensy:avr:teensy41",
    name: "Teensy 4.1",
    flasher: "teensy",
    volts: 3.3,
    fiveVoltTolerant: false,
    flashKb: 8192,
    usb: [{ vendorId: 0x16c0 }],
    pins: TEENSY41_PINS,
  },
];

export const boardById = (id: string) => BOARDS.find((b) => b.id === id);
export const boardByFqbn = (fqbn: string) => BOARDS.find((b) => b.fqbn === fqbn);

/** The board a USB serial port belongs to, if it is one we know. */
export function boardByUsb(vendorId?: number, productId?: number): Board | undefined {
  if (vendorId === undefined) return undefined;
  return BOARDS.find((b) => b.usb.some((u) => u.vendorId === vendorId && (u.productId === undefined || u.productId === productId)));
}

/** "1 (TX1)" -> "1", " d4 " -> "D4". */
export const pinToken = (s: string) => s.trim().split(/[\s(,/]/)[0]!.toUpperCase();

/** Indexes of the board's pins that a wiring or sketch pin name refers to (GND and friends match several). */
export function findPins(board: Board, name: string): number[] {
  const t = pinToken(name);
  if (!t) return [];
  const out: number[] = [];
  board.pins.forEach((p, i) => {
    if (p.name.toUpperCase() === t || p.aliases?.some((a) => a.toUpperCase() === t)) out.push(i);
  });
  if (out.length) return out;
  // "(TX1)" style hints inside the text
  const hint = /\(([^)]+)\)/.exec(name)?.[1];
  return hint ? findPins(board, hint) : [];
}
