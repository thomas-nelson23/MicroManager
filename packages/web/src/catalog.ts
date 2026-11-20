/** The server's catalogues (boards, displays) and settings, fetched once per page load. */
import { useEffect, useState } from "react";
import { api, type Board, type DisplayModel } from "./api.ts";

function once<T>(load: () => Promise<T>) {
  let cached: Promise<T> | null = null;
  return () => (cached ??= load().catch((e) => ((cached = null), Promise.reject(e))));
}
const boards = once(api.boards);
const displays = once(api.displays);
const config = once(api.config);

function useLoaded<T>(load: () => Promise<T>, initial: T): T {
  const [v, setV] = useState(initial);
  useEffect(() => {
    load().then(setV, () => {});
  }, [load]);
  return v;
}

const NO_BOARDS: Board[] = [];
const NO_DISPLAYS: DisplayModel[] = [];
const NO_CONFIG: { publicUrl: string; piHost?: string } = { publicUrl: "" };
export const useBoards = () => useLoaded(boards, NO_BOARDS);
export const useDisplays = () => useLoaded(displays, NO_DISPLAYS);
export const useConfig = () => useLoaded(config, NO_CONFIG);

export const displayLabel = (d: { model: string; width: number; height: number }) => `${d.model.replace(/_011$/, "")} · ${d.width}×${d.height}`;
