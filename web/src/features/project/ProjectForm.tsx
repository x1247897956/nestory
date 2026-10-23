import { useState } from "react";
import type { Project } from "../../app/api";
export function ProjectForm({
  project,
  onSubmit,
  onClose,
}: {
  project?: Project;
  onSubmit: (
    title: string,
    description: string,
    version?: number,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [version] = useState(project?.version);
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={project ? "修改项目" : "新建项目"}
      >
        <h2>{project ? "修改项目" : "新建项目"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await onSubmit(title, description, version);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            项目名称
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            项目说明
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <footer>
            <button type="button" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button className="primary" disabled={busy || !title.trim()}>
              {busy ? "保存中…" : "保存项目"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
