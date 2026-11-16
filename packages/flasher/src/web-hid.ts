/** HalfKayTransport over the browser's WebHID API (Chrome/Edge, secure context required). */
import { HALFKAY_PID, TEENSY_VID, type HalfKayTransport } from "./teensy.ts";

export const HALFKAY_FILTERS: HIDDeviceFilter[] = [{ vendorId: TEENSY_VID, productId: HALFKAY_PID }];

export class WebHidHalfKay implements HalfKayTransport {
  constructor(readonly device: HIDDevice) {}

  /** A HalfKay device this page may already use (permission granted earlier), if one is plugged in. */
  static async find(): Promise<WebHidHalfKay | null> {
    if (!("hid" in navigator)) return null;
    const d = (await navigator.hid.getDevices()).find((x) => x.vendorId === TEENSY_VID && x.productId === HALFKAY_PID);
    return d ? new WebHidHalfKay(d) : null;
  }

  /** Ask the user to allow the bootloader (must be called from a click handler). */
  static async request(): Promise<WebHidHalfKay | null> {
    if (!("hid" in navigator)) throw new Error("This browser has no WebHID. Use Chrome or Edge, over HTTPS or localhost.");
    const [d] = await navigator.hid.requestDevice({ filters: HALFKAY_FILTERS });
    return d ? new WebHidHalfKay(d) : null;
  }

  /** Wait for HalfKay to show up (after a reboot into it), among devices this page may use. */
  static async waitFor(ms: number): Promise<WebHidHalfKay | null> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const d = await WebHidHalfKay.find();
      if (d) return d;
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  async open() {
    if (!this.device.opened) await this.device.open();
  }

  async close() {
    if (this.device.opened) await this.device.close().catch(() => {});
  }

  async send(report: Uint8Array): Promise<void> {
    await this.device.sendReport(0, report as Uint8Array<ArrayBuffer>);
  }
}
