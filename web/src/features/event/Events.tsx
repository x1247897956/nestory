import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import zhCN from "@fullcalendar/core/locales/zh-cn";
import { DateTime } from "luxon";
import { api } from "../../app/api";
import { MarkdownEditor } from "../../components/markdown/MarkdownEditor";
import { useAutosave } from "../../components/markdown/useAutosave";
import { Relations } from "../relation/Relations";
import { toInput, fromInput } from "./time";
export type CalendarEvent = {
  id: string;
  project_id: string;
  title: string;
  body: string;
  start_at: string;
  end_at: string;
  version: number;
};
type Draft = { title: string; body: string; start_at: string; end_at: string };
export function Events({
  projectId,
  eventId,
  archived,
}: {
  projectId: string;
  eventId?: string;
  archived: boolean;
}) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [range, setRange] = useState<{ from: string; to: string }>();
  const [selection, setSelection] = useState<{ start: string; end: string }>();
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    if (!selection) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [selection]);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<{ timezone: string }>("/config"),
  });
  const zone = config.data?.timezone;
  useEffect(() => {
    if (zone && params.get("create") === "1" && !archived && !eventId) {
      const start = DateTime.now().setZone(zone).startOf("hour").plus({ hours: 1 });
      setSelection({ start: toInput(start.toISO()!, zone), end: toInput(start.plus({ hours: 1 }).toISO()!, zone) });
    }
  }, [zone, params, archived, eventId]);
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
    if (!archived) {
      setSelection({ start: toInput(start, zone), end: toInput(end, zone) });
      setError("");
    }
  };
  return (
    <div className="calendar-workspace">
      <section aria-label="项目日历">
        <p>显示与输入时区：{zone}</p>
        <FullCalendar
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            interactionPlugin,
            luxonPlugin,
          ]}
          locale={zhCN}
          timeZone={zone}
          initialView="timeGridWeek"
          initialDate={detail.data?.start_at}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,dayGridMonth",
          }}
          buttonText={{ today: "今天", week: "周", month: "月" }}
          height="auto"
          selectable={!archived}
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
          select={(a) => choose(a.startStr, a.endStr)}
          dateClick={(a) => {
            const d = DateTime.fromISO(a.dateStr, { zone });
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
          <form
            aria-label="新建日程"
            data-dirty="true"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const v = await api<CalendarEvent>(
                  "/projects/" + projectId + "/events",
                  "POST",
                  {
                    title,
                    start_at: fromInput(selection.start, zone),
                    end_at: fromInput(selection.end, zone),
                  },
                );
                setTitle("");
                setSelection(undefined);
                await refresh();
                nav("/projects/" + projectId + "/events/" + v.id);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>新建日程</h3>
            <input
              autoFocus
                aria-label="新日程标题"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label>
              开始
              <input
                aria-label="新日程开始"
                type="datetime-local"
                required
                value={selection.start}
                onChange={(e) =>
                  setSelection({ ...selection, start: e.target.value })
                }
              />
            </label>
            <label>
              结束
              <input
                aria-label="新日程结束"
                type="datetime-local"
                required
                value={selection.end}
                onChange={(e) =>
                  setSelection({ ...selection, end: e.target.value })
                }
              />
            </label>
            <button disabled={busy}>创建日程</button>
            <button type="button" onClick={() => setSelection(undefined)}>
              取消
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      {eventId && (
        <aside className="detail-pane">
          <button
            aria-label="关闭日程详情"
            onClick={() => nav("/projects/" + projectId + "/events")}
          >
            ×
          </button>
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
                onReload={async () => {
                  await detail.refetch({ throwOnError: true });
                  setEpoch((n) => n + 1);
                }}
              />
              <Relations
                projectId={projectId}
                type="events"
                id={eventId}
                archived={archived}
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
  onReload: () => Promise<void>;
}) {
  const a = useAutosave(
    {
      title: event.title,
      body: event.body,
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
  );
  const [error, setError] = useState("");
  return (
    <article
      className="editor"
      aria-label="日程详情"
      data-dirty={a.dirty || a.busy}
    >
      <label>
        日程标题
        <input
          aria-label="日程标题"
          disabled={archived}
          value={a.draft.title}
          onChange={(e) => a.setDraft((d) => ({ ...d, title: e.target.value }))}
        />
      </label>
      <p>时间：{zone}</p>
      {(["start_at", "end_at"] as const).map((key) => (
        <label key={key}>
          {key === "start_at" ? "开始时间" : "结束时间"}
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
      <MarkdownEditor
        projectId={event.project_id}
        value={a.draft.body}
        disabled={archived}
        onChange={(body) => a.setDraft((d) => ({ ...d, body }))}
      />
      <div className="save-bar">
        <span role="status">
          {a.busy
            ? "保存中…"
            : a.error
              ? "保存失败"
              : a.dirty
                ? "有未保存更改"
                : "已保存"}
        </span>
        {!archived && (
          <button disabled={a.busy || !a.dirty} onClick={() => void a.save()}>
            保存日程
          </button>
        )}
      </div>
      {(a.error || error) && (
        <div role="alert">
          {a.error || error}
          <p>本地草稿已保留。</p>
          <button onClick={() => void a.save()}>重试保存</button>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(a.draft.body)
                .catch(() => setError("复制失败，请手动复制"))
            }
          >
            复制草稿
          </button>
          <button
            onClick={async () => {
              if (confirm("重新载入会丢弃本地草稿，是否继续？"))
                try {
                  await onReload();
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
