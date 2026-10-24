import { useRef, useState } from "react";
import { abandonCreateIntent } from "../../app/api";
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
  const [initial] = useState({
    title: project?.title ?? "",
    description: project?.description ?? "",
  });
  const [version] = useState(project?.version);
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const attempts = useRef<{title:string;description:string}[]>([]);
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
          data-dirty={
            title !== initial.title ||
            description !== initial.description ||
            busy
          }
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              if (!project) attempts.current.push({title,description});
              await onSubmit(title, description, version);
              for (const input of attempts.current) abandonCreateIntent("/projects",input);
              attempts.current = [];
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
              disabled={busy}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            项目说明
            <textarea
              disabled={busy}
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
            <button
              type="button"
              onClick={() => {
                if (
                  (title === initial.title &&
                    description === initial.description) ||
                  confirm("放弃未保存的项目草稿？")
                ) {
                  try {
                    for (const input of attempts.current) abandonCreateIntent("/projects", input);
                    attempts.current = [];
                    onClose();
                  } catch(err) { setError((err as Error).message); }
                }
              }}
              disabled={busy}
            >
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
