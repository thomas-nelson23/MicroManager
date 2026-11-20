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
  /**
   * How a build gets onto it: from the browser as UPDI over Web Serial, Teensy HalfKay over WebHID or a UF2
   * file on the RP2040's BOOTSEL drive; or, for a Raspberry Pi (a Python program, not a sketch), from the
   * server over SSH.
   */
  flasher: "nano-every" | "teensy" | "rp2040" | "pi";
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

// Raspberry Pi Pico (arduino-pico core). Serial1 = UART0 on GP0/GP1, Serial2 = UART1 on GP8/GP9,
// Wire on GP4/GP5, Wire1 on GP26/GP27, SPI on GP16-19, SPI1 on GP12-15: the core's defaults.
const PICO_ROLE: Record<number, string> = {
  0: "Serial1 TX", 1: "Serial1 RX", 4: "SDA", 5: "SCL", 8: "Serial2 TX", 9: "Serial2 RX",
  12: "MISO1", 13: "CS1", 14: "SCK1", 15: "MOSI1", 16: "MISO", 17: "CS", 18: "SCK", 19: "MOSI",
  26: "A0, SDA1", 27: "A1, SCL1", 28: "A2",
};
function gp(n: number, side: "L" | "R"): BoardPin {
  const caps: PinCap[] = ["pwm"];
  const role = PICO_ROLE[n];
  if (n >= 26) caps.push("analog");
  if (role?.includes("Serial")) caps.push("serial");
  if (role && /SDA|SCL/.test(role)) caps.push("i2c");
  if (n >= 12 && n <= 19) caps.push("spi");
  const aliases = [String(n), `D${n}`];
  if (n >= 26) aliases.push(`A${n - 26}`);
  if (n === 0) aliases.push("TX1");
  if (n === 1) aliases.push("RX1");
  return io(`GP${n}`, side, caps, { aliases, ...(role ? { role } : {}) });
}
const gnd = (side: "L" | "R") => fixed("GND", side, "gnd");

const PICO_PINS: BoardPin[] = [
  gp(0, "L"), gp(1, "L"), gnd("L"), gp(2, "L"), gp(3, "L"), gp(4, "L"), gp(5, "L"), gnd("L"),
  gp(6, "L"), gp(7, "L"), gp(8, "L"), gp(9, "L"), gnd("L"), gp(10, "L"), gp(11, "L"), gp(12, "L"),
  gp(13, "L"), gnd("L"), gp(14, "L"), gp(15, "L"),
  fixed("VBUS", "R", "power", ["5V"]),
  fixed("VSYS", "R", "power"),
  gnd("R"),
  fixed("3V3_EN", "R", "other"),
  fixed("3V3", "R", "power", ["3.3V", "3V3_OUT", "3V3(OUT)"]),
  fixed("ADC_VREF", "R", "other", ["AREF"]),
  gp(28, "R"),
  fixed("AGND", "R", "gnd"),
  gp(27, "R"), gp(26, "R"),
  fixed("RUN", "R", "other", ["RST", "RESET"]),
  gp(22, "R"), gnd("R"), gp(21, "R"), gp(20, "R"), gp(19, "R"), gp(18, "R"), gnd("R"), gp(17, "R"), gp(16, "R"),
];

// Adafruit Feather RP2040 Prop-Maker. Standard Feather header (USB at the top: the 16-pin side on the
// left, the 12-pin side on the right); names are the silkscreen labels, aliases the GPIO numbers that
// code uses. GPIO16-23 drive the Prop-Maker hardware (I2S amp, terminal block, servo header, LIS3DH).
function fp(label: string, gpio: number, side: "L" | "R", caps: PinCap[], role?: string, more: string[] = []): BoardPin {
  return io(label, side, ["pwm", ...caps], { aliases: [String(gpio), `GP${gpio}`, ...more], ...(role ? { role } : {}) });
}
const PROP_MAKER_PINS: BoardPin[] = [
  fixed("RST", "L", "other", ["RESET", "RUN"]),
  fixed("3V3", "L", "power", ["3V", "3.3V"]),
  fixed("NC", "L", "other", ["AREF"]),
  fixed("GND", "L", "gnd"),
  fp("A0", 26, "L", ["analog"]),
  fp("A1", 27, "L", ["analog"]),
  fp("A2", 28, "L", ["analog"]),
  fp("A3", 29, "L", ["analog"]),
  fp("D24", 24, "L", []),
  fp("D25", 25, "L", []),
  fp("SCK", 14, "L", ["spi"], "SCK"),
  fp("MO", 15, "L", ["spi"], "MOSI", ["MOSI"]),
  fp("MI", 8, "L", ["spi"], "MISO", ["MISO"]),
  fp("RX", 1, "L", ["serial"], "Serial1 RX", ["RX1"]),
  fp("TX", 0, "L", ["serial"], "Serial1 TX", ["TX1"]),
  fp("D4", 4, "L", [], "NeoPixel"),
  fixed("BAT", "R", "power", ["VBAT"]),
  fixed("EN", "R", "other"),
  fixed("USB", "R", "power", ["5V", "VBUS"]),
  fp("D13", 13, "R", [], "LED", ["LED_BUILTIN"]),
  fp("D12", 12, "R", []),
  fp("D11", 11, "R", []),
  fp("D10", 10, "R", []),
  fp("D9", 9, "R", []),
  fp("D6", 6, "R", []),
  fp("D5", 5, "R", []),
  fp("SCL", 3, "R", ["i2c"], "SCL"),
  fp("SDA", 2, "R", ["i2c"], "SDA"),
];

// Raspberry Pi 4 (and 3/5: same 40-pin header). Pins are named by their BCM GPIO number, which code uses
// (gpiozero LED(17)); physical header positions are aliases ("PIN11"). Physical order: odd pins on the
// left, even pins on the right, pin 1 at the top. Hardware PWM is on GPIO12/13/18/19, but gpiozero does
// software PWM on any pin. There are no analog inputs.
const RPI_ROLE: Record<number, string> = {
  2: "SDA", 3: "SCL", 4: "GPCLK0", 14: "TXD", 15: "RXD", 18: "PWM0", 12: "PWM0", 13: "PWM1", 19: "PWM1",
  10: "MOSI", 9: "MISO", 11: "SCLK", 8: "CE0", 7: "CE1", 0: "ID_SD", 1: "ID_SC", 16: "CE2", 20: "MOSI1", 21: "SCLK1",
};
const RPI_HEADER: (number | "3V3" | "5V" | "GND")[] = [
  "3V3", "5V", 2, "5V", 3, "GND", 4, 14, "GND", 15, 17, 18, 27, "GND", 22, 23, "3V3", 24, 10, "GND",
  9, 25, 11, 8, "GND", 7, 0, 1, 5, "GND", 6, 12, 13, "GND", 19, 16, 26, 20, "GND", 21,
];
function rpiPin(p: (typeof RPI_HEADER)[number], i: number): BoardPin {
  const side = i % 2 === 0 ? "L" : "R";
  const phys = `PIN${i + 1}`;
  if (typeof p === "string") return fixed(p, side, p === "GND" ? "gnd" : "power", [phys, ...(p === "3V3" ? ["3.3V"] : [])]);
  const role = RPI_ROLE[p];
  const caps: PinCap[] = ["pwm"];
  if (p === 2 || p === 3) caps.push("i2c");
  if (p === 14 || p === 15) caps.push("serial");
  if ([7, 8, 9, 10, 11, 16, 20, 21].includes(p)) caps.push("spi");
  const aliases = [String(p), `BCM${p}`, `GP${p}`, phys];
  if (p === 14) aliases.push("TXD", "TX");
  if (p === 15) aliases.push("RXD", "RX");
  return io(`GPIO${p}`, side, caps, { aliases, ...(role ? { role } : {}) });
}
const RPI_PINS: BoardPin[] = [...RPI_HEADER.map(rpiPin).filter((p) => p.side === "L"), ...RPI_HEADER.map(rpiPin).filter((p) => p.side === "R")];

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
  {
    id: "pico",
    fqbn: "rp2040:rp2040:rpipico",
    name: "Raspberry Pi Pico (RP2040)",
    flasher: "rp2040",
    volts: 3.3,
    fiveVoltTolerant: false,
    flashKb: 2048,
    usb: [{ vendorId: 0x2e8a }],
    pins: PICO_PINS,
  },
  {
    id: "feather-rp2040-prop-maker",
    fqbn: "rp2040:rp2040:adafruit_feather_prop_maker",
    name: "Adafruit Feather RP2040 Prop-Maker",
    flasher: "rp2040",
    volts: 3.3,
    fiveVoltTolerant: false,
    flashKb: 8192,
    usb: [{ vendorId: 0x239a, productId: 0x8131 }, { vendorId: 0x239a, productId: 0xc131 }],
    pins: PROP_MAKER_PINS,
  },
  {
    id: "rpi4",
    fqbn: "linux:rpi:pi4",
    name: "Raspberry Pi 4",
    flasher: "pi",
    volts: 3.3,
    fiveVoltTolerant: false,
    flashKb: 0,
    usb: [],
    pins: RPI_PINS,
  },
];

/** A Linux board: the project is a Python program in pi/, deployed over SSH, not an Arduino sketch. */
export const isPiBoard = (fqbn: string) => fqbn.startsWith("linux:");

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
