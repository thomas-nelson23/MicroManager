/** Pick the board a project targets (a segmented control over the server's board list). */
import { useEffect, useState } from "react";
import { api, type Board } from "../api.ts";

let cached: Promise<Board[]> | null = null;
const boards = () => (cached ??= api.boards().catch((e) => ((cached = null), Promise.reject(e))));

export function BoardPicker({ fqbn, onPick, disabled }: { fqbn: string | undefined; onPick: (b: Board) => void; disabled?: boolean }) {
  const list = useBoards();
  if (list.length < 2) return null;
  return (
    <div className="seg" role="radiogroup" aria-label="Board">
      {list.map((b) => {
        const on = b.fqbn === fqbn;
        return (
          <button key={b.id} type="button" role="radio" aria-checked={on} className={on ? "checked" : ""} disabled={disabled} onClick={() => !on && onPick(b)}>
            {b.name}
          </button>
        );
      })}
    </div>
  );
}

export const useBoards = () => {
  const [list, setList] = useState<Board[]>([]);
  useEffect(() => {
    boards().then(setList, () => {});
  }, []);
  return list;
};
