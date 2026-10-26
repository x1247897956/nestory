import { ObjectDialog, useOverviewBackground } from "../../components/object/ObjectDialog";
import { ObjectMenu } from "../../components/object/ObjectMenu";
import "./events.css";
import { SaveIndicator } from "../../components/markdown/SaveIndicator";
import type { EventChangeArg } from "@fullcalendar/core";
import type { BodyDocument } from "../../app/document";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import zhCN from "@fullcalendar/core/locales/zh-cn";
import { DateTime } from "luxon";
import { api, abandonCreateIntent } from "../../app/api";
import { MarkdownEditor } from "../../components/markdown/MarkdownEditor";
import { useAutosave } from "../../components/markdown/useAutosave";
import { ObjectProperties } from "../../components/object/ObjectProperties";
import { toInput, fromInput } from "./time";
export type CalendarEvent = {
  id: string;
  project_id: string;
  title: string;
  body_document: BodyDocument;
  start_at: string;
  end_at: string;
  version: number;
};
function validTimes(start: string, end: string, zone: string) {
  const a = DateTime.fromISO(start, { zone });
  const b = DateTime.fromISO(end, { zone });
  return a.isValid && b.isValid && b.toMillis() > a.toMillis();
}
type Draft = {
  title: string;
  body_document: BodyDocument;
  start_at: string;
  end_at: string;
};
export function Events({
  projectId,
  projectTitle = "项目",
  eventId,
  archived,
}: {
  projectId: string;
  projectTitle?: string;
  eventId?: string;
  archived: boolean;
}) {
  const nav = useNavigate();
  const overviewBackground=useOverviewBackground(projectId);
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [range, setRange] = useState<{ from: string; to: string }>();
  const [selection, setSelection] = useState<{ start: string; end: string }>();
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [unresolvedByProject, setUnresolvedByProject] = useState<Record<string, string>>({});
  const unresolved = unresolvedByProject[projectId];
  const [epoch, setEpoch] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const createAttempts = useRef<{path:string;input:object}[]>([]);
  const abandonCreation = () => {
    for (const attempted of createAttempts.current) abandonCreateIntent(attempted.path, attempted.input);
    createAttempts.current = [];
  };
  const mounted = useRef(false);
  const context = useRef({ projectId, eventId });
  context.current = { projectId, eventId };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentProject = useRef(projectId);
  currentProject.current = projectId;
  const dirty = !!selection && !!title.trim();
  useEffect(() => {
    if (selection && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [selection]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  useEffect(() => {
    setSelection(undefined);
    setTitle("");
    setError("");
  }, [projectId, eventId]);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<{ timezone: string }>("/config"),
  });
  const zone = config.data?.timezone;
  useEffect(() => {
    if (zone && params.get("create") === "1" && !archived && !eventId) {
      const start = DateTime.now()
        .setZone(zone)
        .startOf("hour")
        .plus({ hours: 1 });
      setSelection({
        start: toInput(start.toISO()!, zone),
        end: toInput(start.plus({ hours: 1 }).toISO()!, zone),
      });
    }
  }, [zone, params, archived, eventId, projectId]);
  const events = useQuery({
    queryKey: ["events", projectId, range],
    queryFn: () =>
      api<CalendarEvent[]>(
        "/projects/" + projectId + "/events?" + new URLSearchParams(range!),
      ),
    enabled: !!range,
  });
  const detail = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => api<CalendarEvent>("/events/" + eventId),
    enabled: !!eventId,
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["events", projectId] }),
      qc.invalidateQueries({ queryKey: ["relation-options", projectId] }),
      qc.invalidateQueries({ queryKey: ["relations"] }),
    ]);
  };
  const createEvent = async () => {
    if (
      !zone ||
      !selection ||
      !title.trim() ||
      !validTimes(selection.start, selection.end, zone) ||
      saving.current ||
      archived
    )
      return;
    saving.current = true;
    setBusy(true);
    setError("");
    const owner = projectId;
    try {
      const input = {title: title.trim(), start_at: fromInput(selection.start, zone), end_at: fromInput(selection.end, zone)};
      const path = "/projects/" + owner + "/events";
      createAttempts.current.push({path,input});
      const v = await api<CalendarEvent>(path,"POST",input);
      abandonCreation();
      qc.setQueryData(["event", v.id], v);
      if (
        !mounted.current ||
        currentProject.current !== owner ||
        context.current.eventId
      )
        return;
      await refresh();
      if (
        !mounted.current ||
        currentProject.current !== owner ||
        context.current.eventId
      )
        return;
      flushSync(() => {
        setTitle("");
        setSelection(undefined);
        setBusy(false);
      });
      nav("/projects/" + owner + "/events/" + v.id);
    } catch (e) {
      if (mounted.current && currentProject.current === owner)
        setError((e as Error).message);
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (
      !dirty ||
      busy ||
      error ||
      !zone ||
      !selection ||
      !validTimes(selection.start, selection.end, zone)
    )
      return;
    const timer = setTimeout(() => void createEvent(), 800);
    return () => clearTimeout(timer);
  }, [selection, title, busy, error, zone, archived]);
  const reconcile = async (id: string, owner: string) => {
    const next = await api<CalendarEvent>("/events/" + id);
    qc.setQueryData(["event", id], next);
    qc.setQueriesData<CalendarEvent[]>({ queryKey: ["events", owner] },
      (old) => old?.map((item) => item.id === id ? next : item));
    setUnresolvedByProject((old) => { const next = { ...old }; delete next[owner]; return next; });
  };
  const changeEvent = async (info: EventChangeArg) => {
    const original = events.data?.find((e) => e.id === info.event.id);
    if (
      !original ||
      original.project_id !== projectId ||
      archived ||
      unresolved ||
      saving.current ||
      !info.event.start ||
      !info.event.end
    ) {
      info.revert();
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    const owner = projectId;
    try {
      const next = await api<CalendarEvent>("/events/" + original.id, "PATCH", {
        start_at: info.event.start.toISOString(),
        end_at: info.event.end.toISOString(),
        version: original.version,
      });
      qc.setQueryData(["event", original.id], next);
      qc.setQueriesData<CalendarEvent[]>({ queryKey: ["events", owner] }, (old) => old?.map((item) => item.id === next.id ? next : item));
      if (currentProject.current === owner) await refresh();
    } catch (e) {
      try {
        await reconcile(original.id, owner);
        if (mounted.current && currentProject.current === owner) setError((e as Error).message);
      } catch {
        if (mounted.current) {
          setUnresolvedByProject((old) => ({ ...old, [owner]: original.id }));
          if (currentProject.current === owner) setError("保存结果尚未确认，请同步日程后继续拖动。");
        }
      }
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  if (!zone)
    return (
      <p role={config.isError ? "alert" : undefined}>
        {config.isError ? "部署时区加载失败" : "加载日历…"}
        {config.isError && (
          <button onClick={() => void config.refetch()}>重试</button>
        )}
      </p>
    );
  const choose = (start: string, end: string) => {
    if (!archived && !saving.current) {
      setSelection({ start: toInput(start, zone), end: toInput(end, zone) });
      setError("");
    }
  };
  return (
    <div
      className="calendar-workspace"
      data-dirty={busy}
    >
      {!overviewBackground && (
        <section aria-label="项目日历" aria-hidden={eventId?true:undefined} inert={!!eventId}>
          <div className="calendar-heading">
            <div>
              <h1>日程</h1>
            </div>
            {!archived && (
              <button
                className="calendar-new"
                disabled={busy}
                onClick={() => {
                  const start = DateTime.now()
                    .setZone(zone)
                    .startOf("day")
                    .set({ hour: 9 });
                  choose(start.toISO()!, start.plus({ hours: 1 }).toISO()!);
                }}
              >
                新建日程
              </button>
            )}
          </div>
          <FullCalendar
            plugins={[
              dayGridPlugin,
              timeGridPlugin,
              interactionPlugin,
              luxonPlugin,
            ]}
            locale={zhCN}
            timeZone={zone}
            initialView="dayGridMonth"
            initialDate={detail.data?.start_at}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "timeGridWeek,dayGridMonth",
            }}
            buttonText={{ today: "今天", week: "周", month: "月" }}
            height="min(720px, calc(100vh - 220px))"
            allDaySlot={false}
            scrollTime="08:00:00"
            editable={!archived && !busy && !unresolved}
            eventChange={(info) => void changeEvent(info)}
            selectable={!archived && !busy}
            selectMirror
            nowIndicator
            events={(events.data ?? []).map((e) => ({
              id: e.id,
              title: e.title,
              start: e.start_at,
              end: e.end_at,
              allDay: false,
            }))}
            datesSet={(a) =>
              setRange((old) =>
                old?.from === a.startStr && old?.to === a.endStr
                  ? old
                  : { from: a.startStr, to: a.endStr },
              )
            }
            select={(a) => {
              const start = DateTime.fromISO(a.startStr, { zone });
              const chosen = a.allDay ? start.set({ hour: 9 }) : start;
              choose(
                chosen.toISO()!,
                (a.allDay
                  ? chosen.plus({ hours: 1 })
                  : DateTime.fromISO(a.endStr, { zone })
                ).toISO()!,
              );
            }}
            dateClick={(a) => {
              const parsed = DateTime.fromISO(a.dateStr, { zone });
              const d = a.allDay ? parsed.set({ hour: 9 }) : parsed;
              choose(d.toISO()!, d.plus({ hours: 1 }).toISO()!);
            }}
            eventClick={(a) =>
              nav("/projects/" + projectId + "/events/" + a.event.id)
            }
            eventTimeFormat={{
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }}
            displayEventEnd
          />
          {events.isError && (
            <p role="alert">
              日程加载失败
              <button onClick={() => void events.refetch()}>重试</button>
            </p>
          )}
          {selection && !archived && (
            <dialog
              ref={dialog}
              className="event-create-dialog"
              aria-label="新建日程"
              onCancel={(e) => {
                e.preventDefault();
                if (!busy && (!dirty || confirm("日程尚未保存，是否关闭？"))) {
                  try { abandonCreation(); } catch(e) { setError((e as Error).message); return; }
                  setSelection(undefined);
                  setTitle("");
                  setError("");
                }
              }}
            >
              <form
                aria-label="新建日程"
                data-dirty={dirty || busy}
                onSubmit={(e) => e.preventDefault()}
              >
                <header>
                  <h2>新建日程</h2>
                  <button
                    type="button"
                    aria-label="关闭新建日程"
                    disabled={busy}
                    onClick={() => {
                      if (!dirty || confirm("日程尚未保存，是否关闭？")) {
                        try { abandonCreation(); } catch(e) { setError((e as Error).message); return; }
                        setSelection(undefined);
                        setTitle("");
                        setError("");
                      }
                    }}
                  >
                    ×
                  </button>
                </header>
                <input
                  autoFocus
                  aria-label="新日程标题"
                  placeholder="日程标题"
                  disabled={busy}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setError("");
                  }}
                />
                <div className="event-create-times">
                  {(["start", "end"] as const).map((key) => (
                    <label key={key}>
                      {key === "start" ? "开始" : "结束"}
                      <input
                        aria-label={
                          key === "start" ? "新日程开始" : "新日程结束"
                        }
                        type="datetime-local"
                        disabled={busy}
                        value={selection[key]}
                        onChange={(e) => {
                          setSelection({ ...selection, [key]: e.target.value });
                          setError("");
                        }}
                      />
                    </label>
                  ))}
                </div>
                {!validTimes(selection.start, selection.end, zone) && (
                  <p role="alert">结束时间必须晚于开始时间</p>
                )}
                {!dirty && !busy && !error ? (
                  <div className="autosave-hint">输入标题后自动保存</div>
                ) : (
                  <SaveIndicator busy={busy} dirty={dirty} error={error} />
                )}
                {error && (
                  <div role="alert">
                    {error}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void createEvent()}
                    >
                      重试保存
                    </button>
                  </div>
                )}
              </form>
            </dialog>
          )}
          {error && !selection && <p role="alert">{error}</p>}
          {unresolved && <button disabled={busy} onClick={async () => {
            setBusy(true);
            try { await reconcile(unresolved, projectId); setError(""); }
            catch { setError("同步失败，保存结果仍未确认，请重试同步。"); }
            finally { setBusy(false); }
          }}>同步日程</button>}
        </section>
      )}
      {eventId && (
        <ObjectDialog projectId={projectId} projectTitle={projectTitle} type="events" title={detail.data?.title ?? "加载中…"}>
        <aside className="detail-pane">
          {detail.data?.project_id === projectId ? (
            <>
              <EventEditor
                key={eventId + ":" + epoch}
                event={detail.data}
                zone={zone}
                archived={archived}
                onSave={async (d, v) => {
                  const next = await api<CalendarEvent>(
                    "/events/" + eventId,
                    "PATCH",
                    { ...d, version: v },
                  );
                  qc.setQueryData(["event", eventId], next);
                  await refresh();
                }}
                onReload={async (beforeReset) => {
                  await detail.refetch({ throwOnError: true });
                  beforeReset?.();
                  setEpoch((n) => n + 1);
                }}
              />
            </>
          ) : detail.isError ? (
            <p role="alert">
              日程加载失败
              <button onClick={() => void detail.refetch()}>重试</button>
            </p>
          ) : (
            <p>加载日程…</p>
          )}
        </aside>
        </ObjectDialog>
      )}
    </div>
  );
}
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
      <header className="task-inline-header">
        <div className="object-title-row">
        <h2 aria-label={a.draft.title}>
          <input
            className="task-inline-title"
            aria-label="日程标题"
            disabled={archived}
            value={a.draft.title}
            onChange={(e) =>
              a.setDraft((d) => ({ ...d, title: e.target.value }))
            }
          />
        </h2>
        <ObjectMenu type="events" id={event.id} projectId={event.project_id} archived={archived}/>
        </div>
        <ObjectProperties
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
        </ObjectProperties>
      </header>
      <MarkdownEditor
        projectId={event.project_id}
        onPendingChange={setBodyPending}
        body_document={a.draft.body_document}
        disabled={archived}
        onChange={(body_document) =>
          a.setDraft((d) => ({ ...d, body_document }))
        }
      />
      {!a.draft.title.trim() && <p role="alert">请输入日程标题</p>}
      {!validTimes(a.draft.start_at, a.draft.end_at, zone) && (
        <p role="alert">结束时间必须晚于开始时间</p>
      )}
      <SaveIndicator busy={a.busy} dirty={a.dirty} error={a.error} />
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
    </article>
  );
}
