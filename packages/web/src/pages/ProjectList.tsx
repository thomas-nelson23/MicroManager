/** Placeholder landing page: pick a project or create one. (The real landing page comes later.) */
import { useEffect, useState } from "react";
import { ago, api, type ProjectMeta } from "../api.ts";
import { BoardPicker, useBoards } from "../components/BoardPicker.tsx";
import { Icon } from "../components/Icon.tsx";

export function ProjectList({ navigate }: { navigate: (to: string) => void }) {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const boards = useBoards();
  const [boardId, setBoardId] = useState<string | null>(null);
  const board = boards.find((b) => b.id === boardId) ?? boards[0];

  useEffect(() => {
    api.projects().then(setProjects, (e: Error) => setError(e.message));
  }, []);

  const create = async () => {
    try {
      const p = await api.create(title.trim() || "New project", board?.id);
      navigate(`/p/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="page app">
      <header className="appbar">
        <span className="wordmark">Nextion <b>Arduino</b></span>
      </header>
      <div className="edge" />
      <main className="list-main">
        <h1>Projects</h1>
        {error && <div className="msg bad"><span className="led" /><div className="body"><b>Couldn't load projects.</b> {error}</div></div>}
        <form className="card new-project" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <label htmlFor="new-title" className="eyebrow">New project</label>
          <div className="row">
            <input id="new-title" className="text-input" value={title} placeholder="Greenhouse monitor" onChange={(e) => setTitle(e.target.value)} />
            <button className="btn md primary" type="submit"><Icon name="plus" />Create</button>
          </div>
          <BoardPicker fqbn={board?.fqbn} onPick={(b) => setBoardId(b.id)} />
        </form>
        <div className="cards">
          {projects?.map((p) => (
            <a key={p.id} className="card project-card" href={`/p/${p.id}`} onClick={(e) => { e.preventDefault(); navigate(`/p/${p.id}`); }}>
              <span className="h3">{p.title}</span>
              <span className="card-text">{p.description || "No description yet."}</span>
              <span className="card-foot">{p.board.name} · {p.display.model} · updated {ago(p.updatedAt)}</span>
            </a>
          ))}
          {projects?.length === 0 && <div className="empty"><span className="h4">No projects yet</span><span>Create one above to start.</span></div>}
        </div>
      </main>
    </div>
  );
}
