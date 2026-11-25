/** The Feature requests tab: write down what MicroManager should do next, and send it to the project on GitHub. */
import { useEffect, useState } from "react";
import { ago, api, type FeatureKind, type FeatureRequest } from "../api.ts";
import { useConfig } from "../catalog.ts";
import { AppNav } from "../components/AppNav.tsx";
import { useDialog } from "../components/Dialog.tsx";
import { Icon } from "../components/Icon.tsx";

const KINDS: { id: FeatureKind; label: string }[] = [
  { id: "feature", label: "New feature" },
  { id: "board", label: "Support a board" },
  { id: "display", label: "Support a display" },
  { id: "improvement", label: "Improve something" },
  { id: "other", label: "Other" },
];
const kindLabel = (k: FeatureKind) => KINDS.find((x) => x.id === k)?.label ?? k;

/** A prefilled "new issue" link for the repo's feature request form (.github/ISSUE_TEMPLATE/feature_request.yml). */
export function issueUrl(repo: string, r: Pick<FeatureRequest, "title" | "details" | "kind">): string {
  const q = new URLSearchParams({ template: "feature_request.yml", labels: "enhancement", title: r.title, kind: kindLabel(r.kind), details: r.details });
  return `https://github.com/${repo}/issues/new?${q}`;
}

export function FeatureRequests({ navigate }: { navigate: (to: string) => void }) {
  const [list, setList] = useState<FeatureRequest[] | null>(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [kind, setKind] = useState<FeatureKind>("feature");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { feedbackRepo } = useConfig();
  const dialog = useDialog();

  const load = () => api.featureRequests().then(setList, (e: Error) => setError(e.message));
  useEffect(() => {
    document.title = "Feature requests · MicroManager";
    void load();
  }, []);

  const submit = async () => {
    if (!title.trim()) return setError("Give the request a short title.");
    setSaving(true);
    setError(null);
    try {
      await api.addFeatureRequest({ title, details, kind });
      setTitle("");
      setDetails("");
      setKind("feature");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const send = async (r: FeatureRequest) => {
    window.open(issueUrl(feedbackRepo, r), "_blank", "noopener");
    await api.markFeatureRequestSent(r.id).then(load, () => {});
  };

  const remove = async (r: FeatureRequest) => {
    if (await dialog.ask({ title: `Delete "${r.title}"?`, body: <p>It leaves this list. An issue already opened on GitHub stays there.</p>, confirm: "Delete", danger: true })) {
      await api.removeFeatureRequest(r.id).then(load, (e: Error) => setError(e.message));
    }
  };

  return (
    <div className="page app">
      <AppNav current="requests" navigate={navigate} />
      <div className="edge" />
      <main className="list-main">
        <div className="list-head">
          <h1>Feature requests</h1>
          <span className="note">{list ? `${list.length} request${list.length === 1 ? "" : "s"}` : ""}</span>
        </div>
        <p className="note fr-intro">
          Missing a board, a display, or something the chat should do? Write it down here. Requests are saved on this server
          {feedbackRepo ? <>, and <b>Send on GitHub</b> opens it as an issue on <a href={`https://github.com/${feedbackRepo}/issues`} target="_blank" rel="noreferrer">{feedbackRepo}</a> so the developers see it</> : null}.
        </p>
        {error && <div className="msg bad"><span className="led" /><div className="body">{error}</div></div>}

        <form className="card fr-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="fr-row">
            <label className="np-field grow">
              <span className="eyebrow">Title</span>
              <input className="text-input" value={title} maxLength={120} placeholder="Support the ESP32-S3" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="np-field">
              <span className="eyebrow">Kind</span>
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value as FeatureKind)}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
          </div>
          <label className="np-field">
            <span className="eyebrow">Details</span>
            <textarea className="text-input fr-details" rows={5} value={details} maxLength={4000} placeholder="What should it do, and what are you building that needs it?" onChange={(e) => setDetails(e.target.value)} />
          </label>
          <div className="fr-actions">
            <button className="btn md primary" type="submit" disabled={saving}><Icon name="plus" />Save request</button>
          </div>
        </form>

        {list?.length === 0 && <div className="empty"><span className="h4">No requests yet</span><span>The first one you save shows up here.</span></div>}
        {list && list.length > 0 && (
          <div className="card flush list-card">
            <table className="table project-table">
              <thead>
                <tr><th>Request</th><th>Kind</th><th>Saved</th><th>GitHub</th><th /></tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="project-link">{r.title}</span>
                      {r.details && <span className="project-desc fr-desc">{r.details}</span>}
                    </td>
                    <td>{kindLabel(r.kind)}</td>
                    <td className="dim">{ago(r.createdAt)}</td>
                    <td>
                      {feedbackRepo ? (
                        <button className="btn" type="button" onClick={() => void send(r)}>{r.sentAt ? "Send again" : "Send on GitHub"}</button>
                      ) : <span className="dim">—</span>}
                      {r.sentAt && <span className="dim fr-sent"> sent {ago(r.sentAt)}</span>}
                    </td>
                    <td className="num">
                      <button className="btn quiet icon-only" type="button" aria-label={`Delete ${r.title}`} onClick={() => void remove(r)}><Icon name="x" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {dialog.node}
    </div>
  );
}
