import {useI18n, t as tr, translateError} from "../../i18n";
import { ObjectMenu } from "../../components/object/ObjectMenu";
import type { BodyDocument } from "../../app/document";
import { ObjectProperties } from "../../components/object/ObjectProperties";
import {ObjectEditorHeader, ObjectEditorBody, ObjectEditorFooter} from "../../components/object/ObjectEditor";
import { useState } from "react";
import { LazyBlockEditor } from "../../components/editor/LazyBlockEditor";
import { useAutosave } from "../../components/editor/useAutosave";
import type { Task, TaskProperties } from "../../app/api";
import { stages, priorities } from "../../app/api";
export type TaskDraft = {
  title: string;
  body_document: BodyDocument;
  stage: string;
  priority: string;
  due_date: string;
};
const fromTask = (t: Task): TaskDraft => ({
  title: t.title,
  body_document: t.body_document ?? { version: 1, blocks: [] },
  stage: t.stage,
  priority: t.priority,
  due_date: t.due_date ?? "",
});
export function TaskEditor({
  task,
  parent,
  parentOptions = [],
  hasChildren = false,
  onParentChange,
  archived,
  onSave,
  onReload,
}: {
  task: Task;
  parent?: TaskProperties;
  parentOptions?: TaskProperties[];
  hasChildren?: boolean;
  onParentChange?: (parentId: string, version: number) => Promise<void>;
  archived: boolean;
  onSave: (draft: TaskDraft, version: number) => Promise<void>;
  onReload: (beforeReset?: () => void) => void | Promise<void>;
}) {
  useI18n();
  const {
    draft,
    setDraft,
    busy,
    error: saveError,
    dirty,
    save,
    version,
    discardRecovery,
    canRecover,
    recover,
  } = useAutosave(
    fromTask(task),
    task.version,
    onSave,
    archived,
    (d) => !!d.title.trim(),
    `tasks:${task.project_id}:${task.id}`,
  );
  const [error, setError] = useState("");
  const [moving, setMoving] = useState(false);
  const [bodyPending, setBodyPending] = useState(false);
  const locked = archived || moving;
  const choices =
    parent && !parentOptions.some((t) => t.id === parent.id)
      ? [...parentOptions, parent]
      : parentOptions;
  const change = (
    key: Exclude<keyof TaskDraft, "body_document">,
    value: string,
  ) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <section
      className="editor"
      data-dirty={dirty || busy || moving || bodyPending}
      aria-label={tr("任务详情")}
    >
      <ObjectEditorHeader title={draft.title} menu={<ObjectMenu type="tasks" id={task.id} projectId={task.project_id} archived={archived}/>} properties={<ObjectProperties
          projectId={task.project_id}
          type="tasks"
          id={task.id}
          version={task.version}
          archived={archived}
        >
          <label className="task-property stage-property" data-property="stage">
            <i className={"stage-dot " + draft.stage} aria-hidden="true" />
            <select
              aria-label={tr("阶段")}
              value={draft.stage}
              onChange={(e) => change("stage", e.target.value)}
              disabled={locked}
            >
              {stages.map(([id, name]) => (
                <option key={id} value={id}>
                  {tr(name)}
                </option>
              ))}
            </select>
          </label>
          <label className="task-property" data-property="priority">
            <select
              aria-label={tr("优先级")}
              value={draft.priority}
              onChange={(e) => change("priority", e.target.value)}
              disabled={locked}
            >
              {priorities.map(([id, name]) => (
                <option key={id} value={id}>
                  {tr(name)}
                </option>
              ))}
            </select>
          </label>
          <label className="task-property" data-property="due_date">
            <input
              aria-label={tr("截止日期")}
              type="date"
              value={draft.due_date}
              onChange={(e) => change("due_date", e.target.value)}
              disabled={locked}
            />
          </label>
          <label
            className="task-property parent-property"
            data-property="parent_id"
          >
            <select
              aria-label={tr("父任务")}
              value={task.parent_id ?? ""}
              disabled={
                locked || dirty || busy || bodyPending || hasChildren || !onParentChange
              }
              title={
                hasChildren
                  ? tr("含子任务的任务不能设置父任务")
                  : dirty || busy || bodyPending
                    ? tr("正在保存正文，请稍候")
                    : undefined
              }
              onChange={async (event) => {
                if (bodyPending) return;
                const parentId = event.target.value;
                setMoving(true);
                setError("");
                try {
                  await onParentChange?.(parentId, version);
                } catch (e) {
                  setError("父任务调整失败：" + (e as Error).message);
                } finally {
                  setMoving(false);
                }
              }}
            >
              <option value="">{tr("无父任务")}</option>
              {choices.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </ObjectProperties>}>
          <input
            className="task-inline-title"
            aria-label={tr("任务标题")}
            value={draft.title}
            onChange={(e) => change("title", e.target.value)}
            disabled={locked}
            placeholder={tr("任务标题")}
          />
      </ObjectEditorHeader>
      <ObjectEditorBody>
        <LazyBlockEditor
          body_document={draft.body_document}
          onChange={(body_document) =>
            setDraft((d) => ({ ...d, body_document }))
          }
          disabled={locked}
          onPendingChange={setBodyPending}
          projectId={task.project_id}
        />
      </ObjectEditorBody>
      <ObjectEditorFooter
        busy={busy || moving}
        dirty={dirty}
        error={translateError(error || saveError)}
      >
      {(error || saveError) && (
        <div className="error" role="alert">
          {translateError(error || saveError)}
          <p>{tr("本地草稿已保留。可先复制正文，再重新载入。")}</p>
          {canRecover && <button disabled={bodyPending || busy || moving} onClick={() => { if (!bodyPending && !busy && !moving) recover(); }}>{tr("恢复本机草稿")}</button>}
          <button onClick={save} disabled={busy}>
            {tr("重试保存")}
          </button>
          <button
            onClick={() =>
              navigator.clipboard
                .writeText(JSON.stringify(draft.body_document, null, 2))
                .catch(() => setError("复制失败，请手动选择正文复制"))
            }
          >
            {tr("复制草稿")}
          </button>{" "}
          <button
            disabled={bodyPending || busy || moving}
            onClick={async () => {
              if (bodyPending || busy || moving) return;
              if (window.confirm(tr("重新载入会丢弃本地未保存更改，是否继续？")))
                try {
                  await onReload(discardRecovery);
                } catch (e) {
                  setError((e as Error).message);
                }
            }}
          >
            {tr("重新载入")}
          </button>
        </div>
      )}
      </ObjectEditorFooter>
    </section>
  );
}
