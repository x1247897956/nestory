import { useState } from "react";
import { MarkdownEditor } from "../../components/markdown/MarkdownEditor";
import { useAutosave } from "../../components/markdown/useAutosave";
import type { Task } from "../../app/api";
import { stages, priorities } from "../../app/api";
export type TaskDraft = {
  title: string;
  body: string;
  stage: string;
  priority: string;
  due_date: string;
};
const fromTask = (t: Task): TaskDraft => ({
  title: t.title,
  body: t.body,
  stage: t.stage,
  priority: t.priority,
  due_date: t.due_date ?? "",
});
export function TaskEditor({
  task,
  archived,
  onSave,
  onReload,
}: {
  task: Task;
  archived: boolean;
  onSave: (draft: TaskDraft, version: number) => Promise<void>;
  onReload: () => void | Promise<void>;
}) {
  const {
    draft,
    setDraft,
    version,
    busy,
    error: saveError,
    dirty,
    save,
  } = useAutosave(fromTask(task), task.version, onSave, archived);
  const [error, setError] = useState("");
  const saved = !dirty;
  const change = (key: keyof TaskDraft, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <section className="editor" data-dirty={dirty} aria-label="任务详情">
      <div className="eyebrow">
        TASK / {task.parent_id ? "子任务" : "任务详情"} <span>v{version}</span>
      </div>
      <label>
        任务标题
        <input
          aria-label="任务标题"
          value={draft.title}
          onChange={(e) => change("title", e.target.value)}
          disabled={archived}
        />
      </label>
      <div className="field-grid">
        <label>
          阶段
          <select
            aria-label="阶段"
            value={draft.stage}
            onChange={(e) => change("stage", e.target.value)}
            disabled={archived}
          >
            {stages.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          优先级
          <select
            aria-label="优先级"
            value={draft.priority}
            onChange={(e) => change("priority", e.target.value)}
            disabled={archived}
          >
            {priorities.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          截止日期
          <input
            aria-label="截止日期"
            type="date"
            value={draft.due_date}
            onChange={(e) => change("due_date", e.target.value)}
            disabled={archived}
          />
        </label>
      </div>
      <div className="body-label">
        Markdown 正文
        <MarkdownEditor
          value={draft.body}
          onChange={(v) => change("body", v)}
          disabled={archived}
          projectId={task.project_id}
        />
      </div>
      <div className="save-bar">
        <span role="status">
          {busy
            ? "保存中…"
            : dirty
              ? "有未保存更改"
              : saved
                ? "已保存"
                : "已同步"}
        </span>
        {!archived && (
          <button
            className="primary"
            onClick={save}
            disabled={busy || !dirty || !draft.title.trim()}
          >
            保存任务
          </button>
        )}
      </div>
      {(error || saveError) && (
        <div className="error" role="alert">
          {error || saveError}
          <p>本地草稿已保留。可先复制正文，再重新载入。</p>
          <button
            onClick={() =>
              navigator.clipboard
                .writeText(draft.body)
                .catch(() => setError("复制失败，请手动选择正文复制"))
            }
          >
            复制草稿
          </button>{" "}
          <button
            onClick={async () => {
              if (window.confirm("重新载入会丢弃本地未保存更改，是否继续？"))
                try {
                  await onReload();
                } catch (e) {
                  setError((e as Error).message);
                }
            }}
          >
            重新载入
          </button>
          <button onClick={save} disabled={busy}>
            重试保存
          </button>
        </div>
      )}
    </section>
  );
}
