/** Flash an ESP32 from the browser: esptool-js talks to the ROM bootloader over Web Serial. */
import { ESPLoader, Transport, type IEspLoaderTerminal } from "esptool-js";
import { esp32FlashRegions } from "./esp32.ts";

export interface Esp32Progress {
  stage: "connect" | "write";
  done?: number;
  total?: number;
}

/**
 * Write a merged image's bootloader, partition table and app (esp32FlashRegions) and restart the board into it. `port` must be closed; it is closed
 * again afterwards. `chip` (from checkEsp32Image) is checked against the chip on the port before writing.
 */
export async function flashEsp32(port: SerialPort, image: Uint8Array, opts: { chip?: string; baud?: number; progress?: (p: Esp32Progress) => void } = {}): Promise<string> {
  const regions = esp32FlashRegions(image);
  const log: string[] = [];
  const terminal: IEspLoaderTerminal = {
    clean: () => {},
    write: (s) => void log.push(s),
    writeLine: (s) => void log.push(s),
  };
  const transport = new Transport(port, false);
  const loader = new ESPLoader({ transport, baudrate: opts.baud ?? 460800, romBaudrate: 115200, terminal });
  try {
    opts.progress?.({ stage: "connect" });
    try {
      await loader.main("default_reset");
    } catch (e) {
      throw new Error(
        `couldn't reach the ESP32's bootloader (${e instanceof Error ? e.message : String(e)}). Hold the board's BOOT button, press and release EN (or RST), let go of BOOT, and flash again`,
      );
    }
    const found = loader.chip.CHIP_NAME;
    const total = regions.reduce((n, r) => n + r.data.length, 0);
    const before = regions.map((_, i) => regions.slice(0, i).reduce((n, r) => n + r.data.length, 0));
    if (opts.chip && found !== opts.chip) throw new Error(`the board on this port is an ${found}, but the sketch was built for an ${opts.chip}`);
    await loader.writeFlash({
      fileArray: regions,
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      // esptool-js reports each region in compressed bytes: scale that to the region's share of the image
      reportProgress: (i, sent, of) => opts.progress?.({ stage: "write", done: Math.round(before[i]! + (of ? sent / of : 1) * regions[i]!.data.length), total }),
    });
    await loader.after("hard_reset");
    return found;
  } finally {
    await transport.disconnect().catch(() => {});
  }
}
