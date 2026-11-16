/** The landing page: every project in one table, and a form to start a new one. */
import { useEffect, useMemo, useState } from "react";
import { ago, api, type ProjectSummary } from "../api.ts";
import { displayLabel, useBoards, useDisplays } from "../catalog.ts";
import { useDialog } from "../components/Dialog.tsx";
import { Icon } from "../components/Icon.tsx";

type Sort = "updated" | "name" | "board";

export function ProjectList({ navigate }: { navigate: (to: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [menu, setMenu] = useState<string | null>(null);
  const boards = useBoards();
  const displays = useDisplays();
  const [boardId, setBoardId] = useState("");
  const [displayModel, setDisplayModel] = useState("");
  const dialog = useDialog();

  const load = () => api.projects().then(setProjects, (e: Error) => setError(e.message));
  useEffect(() => {
    document.title = "Projects · Nextion Arduino";
    void load();
  }, []);

  const create = async () => {
    try {
      const p = await api.create(title.trim() || "New project", boardId || undefined, displayModel || undefined);
      navigate(`/p/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (projects ?? []).filter((p) => !q || `${p.title} ${p.description} ${p.board.name} ${p.display.model}`.toLowerCase().includes(q));
    return list.sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : sort === "board" ? a.board.name.localeCompare(b.board.name) || a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [projects, query, sort]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const rename = async (p: ProjectSummary) => {
    setMenu(null);
    const t = await dialog.ask({ title: "Rename the project", body: null, confirm: "Rename", input: { label: "Name", value: p.title } });
    if (typeof t === "string") await act(() => api.update(p.id, { title: t }));
  };
  const duplicate = async (p: ProjectSummary) => {
    setMenu(null);
    const t = await dialog.ask({ title: "Duplicate the project", body: <p>The copy gets the sketch, the screen and the wiring. Builds and the conversation stay with the original.</p>, confirm: "Duplicate", input: { label: "Name of the copy", value: `${p.title} copy` } });
    if (typeof t === "string") await act(() => api.duplicate(p.id, t));
  };
  const remove = async (p: ProjectSummary) => {
    setMenu(null);
    if (await dialog.ask({ title: `Delete "${p.title}"?`, body: <p>The project leaves the list. Its folder is moved to the server's trash folder, not erased, so it can be restored by hand.</p>, confirm: "Delete", danger: true })) await act(() => api.remove(p.id));
  };

  const defaultDisplay = displays[0];
  return (
    <div className="page app">
      <header className="appbar">
        <span className="wordmark">Nextion <b>Arduino</b></span>
      </header>
      <div className="edge" />
      <main className="list-main">
        <div className="list-head">
          <h1>Projects</h1>
          <span className="note">{projects ? `${projects.length} project${projects.length === 1 ? "" : "s"}` : ""}</span>
        </div>
        {error && <div className="msg bad"><span className="led" /><div className="body">{error}</div></div>}

        <form className="card new-project" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <label className="np-field grow">
            <span className="eyebrow">New project</span>
            <input id="new-title" className="text-input" value={title} placeholder="Greenhouse monitor" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="np-field">
            <span className="eyebrow">Board</span>
            <select className="select" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              <option value="">Server default</option>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.volts} V</option>)}
            </select>
          </label>
          <label className="np-field">
            <span className="eyebrow">Display</span>
            <select className="select" value={displayModel} onChange={(e) => setDisplayModel(e.target.value)}>
              <option value="">Server default</option>
              {(["Intelligent", "Enhanced", "Discovery", "Basic"] as const).map((series) => (
                <optgroup key={series} label={series}>
                  {displays.filter((d) => d.series === series).map((d) => <option key={d.model} value={d.model}>{displayLabel(d)} · {d.inches}″</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <button className="btn md primary" type="submit" disabled={!defaultDisplay && !projects}><Icon name="plus" />Create</button>
        </form>

        {projects && projects.length > 0 && (
          <div className="list-tools">
            <label className="search">
              <Icon name="search" />
              <input value={query} placeholder="Search projects" aria-label="Search projects" onChange={(e) => setQuery(e.target.value)} />
            </label>
            <div className="seg md" role="group" aria-label="Sort by">
              {(["updated", "name", "board"] as const).map((s) => (
                <button key={s} type="button" className={sort === s ? "checked" : ""} aria-pressed={sort === s} onClick={() => setSort(s)}>{s === "updated" ? "Recent" : s === "name" ? "Name" : "Board"}</button>
              ))}
            </div>
          </div>
        )}

        {projects?.length === 0 && <div className="empty"><span className="h4">No projects yet</span><span>Name one above and pick its board and display to start.</span></div>}
        {projects && projects.length > 0 && (
          <div className="card flush list-card">
            <table className="table project-table">
              <thead>
                <tr><th>Project</th><th>Board</th><th>Display</th><th>Last build</th><th>On device</th><th>Updated</th><th /></tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="pick" onClick={() => navigate(`/p/${p.id}`)}>
                    <td>
                      <a className="project-link" href={`/p/${p.id}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/p/${p.id}`); }}>{p.title}</a>
                      {p.description && <span className="project-desc">{p.description}</span>}
                    </td>
                    <td>{p.board.name}</td>
                    <td className="mono">{p.display.model.replace(/_011$/, "")}<span className="dim"> · {p.display.width}×{p.display.height}</span></td>
                    <td className={p.lastBuild && !p.lastBuild.ok ? "hot" : ""}>{p.lastBuild ? `#${p.lastBuild.n}${p.lastBuild.ok ? "" : " failed"} · ${ago(p.lastBuild.createdAt)}` : <span className="dim">none</span>}</td>
                    <td>{p.onDevice ? (p.lastBuild && p.onDevice === p.lastBuild.n ? `#${p.onDevice} · up to date` : `#${p.onDevice}`) : <span className="dim">—</span>}</td>
                    <td className="dim">{ago(p.updatedAt)}</td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      <span className="pop-anchor">
                        <button className="btn quiet icon-only" type="button" aria-label={`Menu for ${p.title}`} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}><Icon name="more" /></button>
                        {menu === p.id && (
                          <span className="menu pop right" role="menu" onMouseLeave={() => setMenu(null)}>
                            <button className="item" type="button" role="menuitem" onClick={() => void rename(p)}>Rename…</button>
                            <button className="item" type="button" role="menuitem" onClick={() => void duplicate(p)}>Duplicate…</button>
                            <span className="sep" />
                            <button className="item danger" type="button" role="menuitem" onClick={() => void remove(p)}>Delete…</button>
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={7} className="dim">No project matches "{query}".</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {dialog.node}
    </div>
  );
}
