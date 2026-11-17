/**
 * Copying a UF2 onto a BOOTSEL drive (RPI-RP2) with the File System Access API (Chrome/Edge desktop,
 * secure context). The person picks the drive once; the handle is kept in IndexedDB so later flashes
 * only need Chrome's "allow editing" OK, or nothing while the permission lasts.
 */

interface DirHandle {
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(d: Uint8Array): Promise<void>; close(): Promise<void> }>;
    getFile(): Promise<File>;
  }>;
  queryPermission(d: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(d: { mode: "readwrite" }): Promise<PermissionState>;
}
type PickerWindow = Window & { showDirectoryPicker?(o: { id?: string; mode?: "readwrite" }): Promise<DirHandle> };

export const canWriteDrives = () => typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";

const DB = "nextion-arduino";
const STORE = "handles";
const KEY = "rpi-rp2";

function idb<T>(fn: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode = "readonly"): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const req = fn(open.result.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      };
    } catch {
      resolve(undefined);
    }
  });
}

/** True when the folder is a mounted RP2040 BOOTSEL drive (it always holds INFO_UF2.TXT). */
async function isBootDrive(dir: DirHandle): Promise<boolean> {
  try {
    const info = await (await dir.getFileHandle("INFO_UF2.TXT")).getFile();
    return /RP2|RPI/i.test(await info.text());
  } catch {
    return false;
  }
}

export class Uf2Drive {
  constructor(readonly dir: DirHandle) {}

  /** Ask Chrome again for write access to the drive picked on an earlier visit (needs a click). */
  static async renew(): Promise<void> {
    const dir = await idb<DirHandle>((s) => s.get(KEY));
    try {
      if (dir && (await dir.queryPermission({ mode: "readwrite" })) !== "granted") await dir.requestPermission({ mode: "readwrite" });
    } catch {
      /* the prompt couldn't open: the flash asks with a dialog instead */
    }
  }

  /** The drive picked before, if this page may still write to it, once it is mounted (waits up to `ms`). */
  static async remembered(ms = 0): Promise<Uf2Drive | null> {
    const dir = (await idb<DirHandle>((s) => s.get(KEY))) ?? null;
    if (!dir) return null;
    try {
      if ((await dir.queryPermission({ mode: "readwrite" })) !== "granted") return null;
    } catch {
      return null;
    }
    const until = Date.now() + ms;
    for (;;) {
      if (await isBootDrive(dir)) return new Uf2Drive(dir);
      if (Date.now() >= until) return null;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  /** Ask the person to pick the RPI-RP2 drive (must be called from a click handler). */
  static async pick(): Promise<Uf2Drive> {
    const w = window as PickerWindow;
    if (!w.showDirectoryPicker) throw new Error("this browser can't write to a USB drive. Use Chrome or Edge on a computer, or download the .uf2");
    const dir = await w.showDirectoryPicker({ id: KEY, mode: "readwrite" });
    if (!(await isBootDrive(dir))) throw new Error(`“${dir.name}” isn't the Pico's RPI-RP2 drive`);
    await idb((s) => s.put(dir, KEY), "readwrite");
    return new Uf2Drive(dir);
  }

  /**
   * Copy the UF2. The boot ROM flashes the blocks as they arrive and reboots once it has them all,
   * which can pull the drive away before Chrome finishes closing the file: that error is not a
   * failure, so it is ignored and the caller checks that the sketch's serial port comes back.
   */
  async write(data: Uint8Array, name = "sketch.uf2"): Promise<void> {
    const f = await this.dir.getFileHandle(name, { create: true });
    const w = await f.createWritable();
    await w.write(data);
    await w.close().catch(() => {});
  }
}
