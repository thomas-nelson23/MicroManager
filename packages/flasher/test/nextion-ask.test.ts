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
