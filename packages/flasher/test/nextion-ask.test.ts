import { describe, expect, it } from "vitest";
import { ByteQueue, type SerialTransport } from "../src/transport.ts";
import { decodeReply, Nextion } from "../src/nextion.ts";

const E = [0xff, 0xff, 0xff];
const bytes = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A port whose "device" answers each write with canned bytes. */
function fakePort(answer: (written: string) => number[]): SerialTransport {
  const rx = new ByteQueue();
  return {
    rx,
    isOpen: true,
    async open() {},
    async close() {},
    async setSignals() {},
    async write(data) {
      const reply = answer(String.fromCharCode(...data));
      setTimeout(() => rx.push(Uint8Array.from(reply)), 5);
    },
  };
}

describe("sketch requests", () => {
  it("decodes NexPass sketch frames", () => {
    expect(decodeReply(Uint8Array.from([0xa5, ...bytes("hi")]))).toEqual({ sketch: "hi" });
    expect(decodeReply(Uint8Array.of(0xa6))).toEqual({ sketchDone: true });
  });

  it("collects reply lines up to the end marker, keeping other traffic apart", async () => {
    let sent = "";
    const nex = new Nextion(
      fakePort((w) => {
        sent = w;
        return [0xa5, ...bytes("NEC 0x04 0x08"), ...E, 0x65, 0, 2, 1, ...E, 0xa5, ...bytes("NEC 0x04 0x02"), ...E, 0xa6, ...E];
      }),
    );
    const r = await nex.ask("codes");
    expect(sent).toBe("@codes\xff\xff\xff");
    expect(r.lines).toEqual(["NEC 0x04 0x08", "NEC 0x04 0x02"]);
    expect(r.other).toEqual([{ touch: { page: 0, component: 2, event: "press" } }]);
  });

  it("explains an old NexPass that forwarded the request to the display", async () => {
    const nex = new Nextion(fakePort(() => [0x00, ...E]));
    await expect(nex.ask("codes", 300)).rejects.toThrow(/older than the request channel/);
  });
});

describe("NexPass version and TFT upload", () => {
  it("reads the NexPass version, and treats an older sketch as unknown", async () => {
    const v2 = new Nextion(fakePort(() => [0xa5, ...bytes("NexPass 2"), ...E, 0xa6, ...E]));
    expect(await v2.nexpassVersion()).toBe(2);
    const old = new Nextion(fakePort(() => [0xa5, ...bytes("unknown request"), ...E, 0xa6, ...E]));
    expect(await old.nexpassVersion()).toBeUndefined();
    const silent = new Nextion(fakePort(() => []));
    expect(await silent.nexpassVersion(200)).toBeUndefined();
  });

  it("switches baud with a fresh handshake before whmi-wri when asked", async () => {
    const sent: string[] = [];
    const nex = new Nextion(
      fakePort((w) => {
        sent.push(w);
        if (w.startsWith("connect")) return [...bytes("comok 1,30601-0,NX4827P043_011R,163,61488,DE6064B7E70C6B21,16777216"), ...E];
        if (w.startsWith("whmi-wri")) return [0x05];
        if (!w.startsWith("baud=") && !w.startsWith("DRAK") && w !== "\xff\xff\xff") return [0x05];
        return [];
      }),
    );
    const tft = new Uint8Array(5000);
    await nex.uploadTft(tft, { switchFirst: true, uploadBaud: 921600, hostBaud: 921600 });
    const firsts = sent.filter((w) => !w.startsWith("\x00")).map((w) => w.replace(/\xff+$/, ""));
    expect(firsts.slice(0, 2)).toEqual(["baud=921600", ""]);
    expect(firsts).toContain("connect");
    const iBaud = firsts.indexOf("baud=921600");
    const iConnect = firsts.indexOf("connect");
    const iWri = firsts.indexOf("whmi-wri 5000,921600,0");
    expect(iBaud).toBeLessThan(iConnect);
    expect(iConnect).toBeLessThan(iWri);
  });
});
