import { CollectionHeader } from "../view/CollectionHeader";
import { EventTimeline } from "./EventTimeline";
import { timelineRange, type TimelineSpan } from "./timeline";
import { useProjectPreferences } from "../view/preferences";
import { SortControl } from "../view/SortControl";
import { eventSortFields, normalizeSort, sortObjects, type SortSpec } from "../view/sorting";
import { EventEditor } from "./EventEditor";
export { EventEditor } from "./EventEditor";
import { ObjectDialog, useOverviewBackground } from "../../components/object/ObjectDialog";
import "./events.css";
import { SaveIndicator } from "../../components/editor/SaveIndicator";
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
type EventPreferences = { view: 'calendar' | 'timeline'; calendarView: 'dayGridMonth' | 'timeGridWeek'; span: TimelineSpan; date: string; sort: SortSpec };
const defaultPreferences: EventPreferences = {view:'calendar',calendarView:'dayGridMonth',span:'week',date:'',sort:{field:'start_at',direction:'asc'}};
function normalizePreferences(raw: unknown): EventPreferences {
 const v = raw && typeof raw === 'object' ? raw as Partial<EventPreferences> : {};
 return {view:v.view === 'timeline'?'timeline':'calendar',calendarView:v.calendarView === 'timeGridWeek'?'timeGridWeek':'dayGridMonth',span:v.span === 'month'?'month':'week',date:typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && DateTime.fromISO(v.date).isValid?v.date:'',sort:normalizeSort(v.sort,eventSortFields,defaultPreferences.sort)};
}
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
  const [preferences,setPreferences] = useProjectPreferences(projectId,"events",defaultPreferences,normalizePreferences);
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
  const selectedDate = preferences.date || (zone ? DateTime.now().setZone(zone).toISODate()! : '');
  const visibleTimelineRange = zone && selectedDate ? timelineRange(selectedDate,preferences.span,zone) : undefined;
  const queryRange = preferences.view === 'timeline' && visibleTimelineRange ? {from:visibleTimelineRange.start.toISO()!,to:visibleTimelineRange.end.toISO()!} : range;
  const events = useQuery({
    queryKey: ["events", projectId, queryRange],
    queryFn: () =>
      api<CalendarEvent[]>(
        "/projects/" + projectId + "/events?" + new URLSearchParams(queryRange!),
      ),
    enabled: !!zone && !!queryRange,
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
      className="calendar-workspace collection-workspace"
      data-dirty={busy}
    >
      {!overviewBackground && (
        <section aria-label="项目日历" aria-hidden={eventId?true:undefined} inert={!!eventId}>
          <CollectionHeader title="日程" count={events.isPending?"…":events.data?.length??0}
            actions={!archived&&<button className="calendar-new" disabled={busy} onClick={()=>{const start=DateTime.now().setZone(zone).startOf("day").set({hour:9});choose(start.toISO()!,start.plus({hours:1}).toISO()!);}}>新建日程</button>}
            views={<div className="collection-view-switch" role="group" aria-label="日程视图">
              <button aria-pressed={preferences.view==='calendar'} onClick={()=>setPreferences(old=>({...old,view:'calendar'}))}>日历</button>
              <button aria-pressed={preferences.view==='timeline'} onClick={()=>setPreferences(old=>({...old,view:'timeline'}))}>时间轴</button>
            </div>}
            tools={preferences.view==='timeline'?<SortControl key={projectId} value={preferences.sort} fields={eventSortFields} onChange={sort=>setPreferences(old=>({...old,sort}))}/>:undefined}/>
          {archived && <p className="timeline-readonly">项目已归档，日程只读</p>}
          {preferences.view==='timeline' ? <EventTimeline events={sortObjects(events.data??[],preferences.sort)} date={selectedDate} span={preferences.span} zone={zone} onDateChange={date=>setPreferences(old=>({...old,date}))} onSpanChange={span=>setPreferences(old=>({...old,span}))} onOpen={id=>nav("/projects/"+projectId+"/events/"+id)} loading={events.isPending} error={events.isError} onRetry={()=>void events.refetch()}/> : <FullCalendar
            key={projectId}
            plugins={[
              dayGridPlugin,
              timeGridPlugin,
              interactionPlugin,
              luxonPlugin,
            ]}
            locale={zhCN}
            timeZone={zone}
            initialView={preferences.calendarView}
            initialDate={selectedDate}
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
            datesSet={(a) => {
              setRange(old=>old?.from===a.startStr && old?.to===a.endStr ? old : {from:a.startStr,to:a.endStr});
              const anchor = a.view?.calendar?.getDate?.() ?? a.view?.currentStart;
              if (anchor) {
                const date=DateTime.fromJSDate(anchor,{zone}).toISODate()!;
                const calendarView=a.view.type==='timeGridWeek'?'timeGridWeek':'dayGridMonth';
                if (preferences.date!==date || preferences.calendarView!==calendarView) setPreferences(old=>({...old,date,calendarView}));
              }
            }}
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
          />}
          {preferences.view==='calendar' && events.isError && (
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
