import {useState} from "react";
import {DateTime} from "luxon";
import type {BodyDocument} from "../../app/document";
import type {CalendarEvent} from "./Events";
import {ObjectEditorHeader, ObjectEditorBody, ObjectEditorFooter} from "../../components/object/ObjectEditor";
import {MarkdownEditor} from "../../components/markdown/MarkdownEditor";
import {useAutosave} from "../../components/markdown/useAutosave";
import {ObjectProperties} from "../../components/object/ObjectProperties";
import {ObjectMenu} from "../../components/object/ObjectMenu";
import {toInput,fromInput} from "./time";
type Draft={title:string;body_document:BodyDocument;start_at:string;end_at:string};
function validTimes(start:string,end:string,zone:string){const a=DateTime.fromISO(start,{zone}),b=DateTime.fromISO(end,{zone});return a.isValid&&b.isValid&&b.toMillis()>a.toMillis();}
export function EventEditor({
  event,
  zone,
  archived,
  onSave,
  onReload,
}: {
  event: CalendarEvent;
  zone: string;
  archived: boolean;
  onSave: (d: Draft, v: number) => Promise<unknown>;
  onReload: (beforeReset?: () => void) => Promise<void>;
}) {
  const a = useAutosave(
    {
      title: event.title,
      body_document: event.body_document ?? { version: 1, blocks: [] },
      start_at: toInput(event.start_at, zone),
      end_at: toInput(event.end_at, zone),
    },
    event.version,
    async (d, v) =>
      onSave(
        {
          ...d,
          start_at:
            d.start_at === toInput(event.start_at, zone)
              ? event.start_at
              : fromInput(d.start_at, zone),
          end_at:
            d.end_at === toInput(event.end_at, zone)
              ? event.end_at
              : fromInput(d.end_at, zone),
        },
        v,
      ),
    archived,
    (d) => !!d.title.trim() && validTimes(d.start_at, d.end_at, zone),
    `events:${event.project_id}:${event.id}`,
  );
  const [error, setError] = useState("");
  const [bodyPending, setBodyPending] = useState(false);
  return (
    <article
      className="editor"
      aria-label="日程详情"
      data-dirty={a.dirty || a.busy || bodyPending}
    >
      <ObjectEditorHeader title={a.draft.title} menu={<ObjectMenu type="events" id={event.id} projectId={event.project_id} archived={archived}/>} properties={<ObjectProperties
          projectId={event.project_id}
          type="events"
          id={event.id}
          version={event.version}
          archived={archived}
        >
          {(["start_at", "end_at"] as const).map((key) => (
            <label key={key} className="task-property" data-property={key}>
              <input
                aria-label={key === "start_at" ? "开始时间" : "结束时间"}
                type="datetime-local"
                disabled={archived}
                value={a.draft[key]}
                onChange={(e) =>
                  a.setDraft((d) => ({ ...d, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </ObjectProperties>}>
          <input
            className="task-inline-title"
            aria-label="日程标题"
            disabled={archived}
            value={a.draft.title}
            onChange={(e) =>
              a.setDraft((d) => ({ ...d, title: e.target.value }))
            }
          />
      </ObjectEditorHeader>
      <ObjectEditorBody>
      <MarkdownEditor
        projectId={event.project_id}
        onPendingChange={setBodyPending}
        body_document={a.draft.body_document}
        disabled={archived}
        onChange={(body_document) =>
          a.setDraft((d) => ({ ...d, body_document }))
        }
      />
      </ObjectEditorBody>
      <ObjectEditorFooter busy={a.busy} dirty={a.dirty} error={a.error || error} >
      {!a.draft.title.trim() && <p role="alert">请输入日程标题</p>}
      {!validTimes(a.draft.start_at, a.draft.end_at, zone) && (
        <p role="alert">结束时间必须晚于开始时间</p>
      )}

      {(a.error || error) && (
        <div role="alert">
          {a.error || error}
          <p>请保留此页面；可复制草稿备份。</p>
          {a.canRecover && <button disabled={bodyPending || a.busy} onClick={() => { if (!bodyPending && !a.busy) a.recover(); }}>恢复本机草稿</button>}
          <button onClick={() => void a.save()}>重试保存</button>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(JSON.stringify(a.draft.body_document, null, 2))
                .catch(() => setError("复制失败，请手动复制"))
            }
          >
            复制草稿
          </button>
          <button
            disabled={bodyPending || a.busy}
            onClick={async () => {
              if (bodyPending || a.busy) return;
              if (confirm("重新载入会丢弃本地草稿，是否继续？"))
                try {
                  await onReload(a.discardRecovery);
                } catch (e) {
                  setError((e as Error).message);
                }
            }}
          >
            重新载入
          </button>
        </div>
      )}
      </ObjectEditorFooter>
    </article>
  );
}
