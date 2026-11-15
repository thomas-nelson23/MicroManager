/**
 * A serial port that can be opened, closed and reopened at different baud rates, the way Web Serial's
 * SerialPort works. Implementations: web-transport.ts (browser) and node-transport.ts (Node, for tests).
 */
export interface SerialTransport {
  open(baudRate: number): Promise<void>;
  close(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  /** Set modem control lines while open. */
  setSignals(signals: { dtr?: boolean; rts?: boolean }): Promise<void>;
  /** Bytes received since open, consumed as they are read. */
  readonly rx: ByteQueue;
  readonly isOpen: boolean;
}

export class TimeoutError extends Error {
  constructor(what: string) {
    super(`timeout: ${what}`);
    this.name = "TimeoutError";
  }
}

/** FIFO of received bytes with awaitable reads. Transports push into it; protocols read from it. */
export class ByteQueue {
  private chunks: Uint8Array[] = [];
  private length = 0;
  private waiters: Array<() => void> = [];

  push(data: Uint8Array): void {
    if (!data.length) return;
    this.chunks.push(data);
    this.length += data.length;
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  clear(): void {
    this.chunks = [];
    this.length = 0;
  }

  get available(): number {
    return this.length;
  }

  /** Remove and return up to n bytes that are already buffered (no waiting). */
  take(n = Infinity): Uint8Array {
    n = Math.min(n, this.length);
    const out = new Uint8Array(n);
    let off = 0;
    while (off < n) {
      const c = this.chunks[0]!;
      const k = Math.min(c.length, n - off);
      out.set(c.subarray(0, k), off);
      off += k;
      if (k === c.length) this.chunks.shift();
      else this.chunks[0] = c.subarray(k);
    }
    this.length -= n;
    return out;
  }

  /** Wait until at least n bytes are buffered, then remove and return exactly n. */
  async read(n: number, timeoutMs: number, what = `${n} bytes`): Promise<Uint8Array> {
    await this.waitFor(() => this.length >= n, timeoutMs, what);
    return this.take(n);
  }

  /** Wait until pred() is true or the timeout passes. */
  async waitFor(pred: () => boolean, timeoutMs: number, what = "data"): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!pred()) {
      const left = deadline - Date.now();
      if (left <= 0) throw new TimeoutError(what);
      await new Promise<void>((resolve) => {
        const t = setTimeout(done, left);
        function done() {
          clearTimeout(t);
          resolve();
        }
        this.waiters.push(done);
      });
    }
  }

  /** Peek at everything buffered without consuming it. */
  peek(): Uint8Array {
    const all = this.take();
    if (all.length) this.chunks = [all];
    this.length = all.length;
    return all;
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type Progress = (p: { stage: string; done?: number; total?: number; message?: string }) => void;
