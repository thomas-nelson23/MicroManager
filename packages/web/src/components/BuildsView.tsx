/** Every build: what it contains, what failed and why, what's on the device, and flashing any half of it. */
import { Fragment, useState } from "react";
import { ago, api, type BuildPart, type BuildRecord, kb, type ProjectDetail } from "../api.ts";
import { useDevice } from "../device.tsx";
import { type Flasher, flashable, onDevice, type Parts, staleReason } from "../flashing.ts";
import { Icon } from "./Icon.tsx";

function Half({ part, max }: { part: BuildPart | undefined; max?: boolean }) {
  if (!part) return <span className="dim">not built</span>;
  if (!part.ok) return <span className="hot">failed</span>;
  return (
    <span>
      {kb(part.bytes)} KB{max && part.max ? <span className="dim"> of {kb(part.max)}</span> : null}
      {part.fromBuild ? <span className="dim"> · from #{part.fromBuild}</span> : null}
    </span>
  );
}

export function BuildsView({ detail, flasher }: { detail: ProjectDetail; flasher: Flasher }) {
  const device = useDevice();
  const [open, setOpen] = useState<number | null>(detail.builds[0] && (detail.builds[0].sketch?.ok === false || detail.builds[0].screen?.ok === false) ? detail.builds[0].n : null);
  const [menu, setMenu] = useState<number | null>(null);
  const sketchOn = onDevice(detail.builds, "sketch");
  const screenOn = onDevice(detail.builds, "screen");

  if (detail.builds.length === 0) {
    return <div className="empty"><span className="h4">No builds yet</span><span>Claude builds after changing the sketch or the screen.</span></div>;
  }
  const go = (b: BuildRecord, parts: Parts) => {
    setMenu(null);
    void flasher.flash(b, parts);
  };
  return (
    <div className="builds">
      <table className="table">
        <thead>
          <tr>
            <th>Build</th>
            <th>Change</th>
            <th>Sketch</th>
            <th>Screen</th>
            <th>Built</th>
            <th>On device</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {detail.builds.map((b) => {
            const failed = b.sketch?.ok === false || b.screen?.ok === false;
            const stale = staleReason(b, detail);
            const on = [sketchOn?.n === b.n && "sketch", screenOn?.n === b.n && "screen"].filter(Boolean).join(" and ");
            return (
              <Fragment key={b.n}>
                <tr className={on ? "selected" : ""}>
                  <td className="mono">#{b.n}</td>
                  <td>
                    {b.label}
                    {stale && <span className="pill warn" title={`The project's hardware changed: ${stale}.`}>other hardware</span>}
                  </td>
                  <td><Half part={b.sketch} max /></td>
                  <td><Half part={b.screen} /></td>
                  <td className="dim">{ago(b.createdAt)}</td>
                  <td className={on ? "" : "dim"}>{on ? `${on} · ${ago(b.flashed?.sketch ?? b.flashed?.screen)}` : b.flashed ? `was flashed ${ago(b.flashed.sketch ?? b.flashed.screen)}` : "—"}</td>
                  <td className="num">
                    <span className="row-actions">
                      {failed && (
                        <button className="btn quiet" type="button" aria-expanded={open === b.n} onClick={() => setOpen(open === b.n ? null : b.n)}>
                          {open === b.n ? "Hide error" : "Show error"}
                        </button>
                      )}
                      {flashable(b) && (
                        <span className="pop-anchor">
                          <button className="btn" type="button" disabled={!!device.busy} aria-expanded={menu === b.n} onClick={() => setMenu(menu === b.n ? null : b.n)}>
                            <Icon name="zap" />Flash<Icon name="chevronDown" />
                          </button>
                          {menu === b.n && (
                            <span className="menu pop right" role="menu" onMouseLeave={() => setMenu(null)}>
                              {b.sketch?.ok && b.screen?.ok && <button className="item" type="button" role="menuitem" onClick={() => go(b, "both")}>Sketch and screen</button>}
                              {b.sketch?.ok && <button className="item" type="button" role="menuitem" onClick={() => go(b, "sketch")}>Sketch only</button>}
                              {b.screen?.ok && <button className="item" type="button" role="menuitem" onClick={() => go(b, "screen")}>Screen only · about 95 s</button>}
                              <span className="sep" />
                              {b.sketch?.ok && b.sketch.file && <a className="item" role="menuitem" href={api.buildFileUrl(detail.meta.id, b.n, b.sketch.file)} download={`${detail.meta.id}-${b.n}.hex`}><Icon name="download" />Download sketch (.hex)</a>}
                              {b.screen?.ok && b.screen.file && <a className="item" role="menuitem" href={api.buildFileUrl(detail.meta.id, b.n, b.screen.file)} download={`${detail.meta.id}-${b.n}.tft`}><Icon name="download" />Download screen (.tft)</a>}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
                {open === b.n && failed && (
                  <tr className="build-error">
                    <td />
                    <td colSpan={6}>
                      {b.sketch?.ok === false && <><span className="eyebrow">Sketch error</span><pre className="tool-output">{b.sketch.error || "No error text was recorded."}</pre></>}
                      {b.screen?.ok === false && <><span className="eyebrow">Screen error</span><pre className="tool-output">{b.screen.error || "No error text was recorded."}</pre></>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
