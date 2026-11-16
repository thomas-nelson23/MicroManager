/** A small modal for questions that need a deliberate answer (deleting, flashing an old build, switching hardware). */
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export interface Ask {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
  /** A text box, e.g. for a new name. */
  input?: { label: string; value: string };
}

type Pending = Ask & { resolve: (v: string | boolean) => void };

export function useDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  /** Resolves to false when cancelled; to the text when there is an input, otherwise true. */
  const ask = useCallback((a: Ask) => new Promise<string | boolean>((resolve) => setPending({ ...a, resolve })), []);
  const close = (v: string | boolean) => {
    pending?.resolve(v);
    setPending(null);
  };
  const node = pending ? <DialogBox key={pending.title} ask={pending} onClose={close} /> : null;
  return { ask, node };
}

function DialogBox({ ask, onClose }: { ask: Ask; onClose: (v: string | boolean) => void }) {
  const [value, setValue] = useState(ask.input?.value ?? "");
  const ok = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (field.current ?? ok.current)?.focus();
    field.current?.select();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <form
        className="dialog app-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={ask.title}
        onSubmit={(e) => {
          e.preventDefault();
          onClose(ask.input ? value.trim() || false : true);
        }}
      >
        <h2 className="h3">{ask.title}</h2>
        <div className="dialog-body">{ask.body}</div>
        {ask.input && (
          <label className="frow">
            <span className="label">{ask.input.label}</span>
            <input ref={field} className="text-input" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        )}
        <div className="actions end">
          <button className="btn md quiet" type="button" onClick={() => onClose(false)}>Cancel</button>
          <button ref={ok} className={`btn md ${ask.danger ? "danger" : "primary"}`} type="submit">{ask.confirm}</button>
        </div>
      </form>
    </div>
  );
}
