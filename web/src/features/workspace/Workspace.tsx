import {useI18n, t as tr} from "../../i18n";
import interactionPlugin from "@fullcalendar/interaction";
import {DateTime} from "luxon";
import {WorkspaceEventCreate} from "./WorkspaceEventCreate";
import type {CalendarEvent} from "../event/Events";
import "./workspace-create.css";
import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import luxonPlugin from "@fullcalendar/luxon3";
import zhCN from "@fullcalendar/core/locales/zh-cn";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../app/api";
import { useSettings, calendarTimeFormat } from "../settings/preferences";
export type Item = {
  id: string;
  type: string;
  title: string;
  project_id: string;
  project_title: string;
  parent_title?: string;
  path?: string;
  archived: boolean;
  stage?: string;
  due_date?: string;
  start_at?: string;
  end_at?: string;
};
export function ItemList({
  items,
  timezone,
}: {
  items: Item[];
  timezone?: string;
}) {
  const {language} = useI18n();
  const settings=useSettings();
  return (
    <ul>
      {items.map((x) => (
        <li key={x.type + x.id}>
          <Link
            to={
              "/projects/" +
              x.project_id +
              (x.type === "projects" ? "" : "/" + x.type + "/" + x.id)
            }
          >
            {x.title}
          </Link>{" "}
          <small>
            {
              (
                {
                  projects: tr("项目"),
                  tasks: tr("任务"),
                  pages: tr("笔记"),
                  events: tr("日程"),
                } as Record<string, string>
              )[x.type]
            }{" "}
            · {x.project_title}
            {x.parent_title && " / " + x.parent_title}
            {x.path && " / " + x.path}
            {x.archived && tr(" · 已归档")} {x.due_date}{" "}
            {x.start_at &&
              new Date(x.start_at).toLocaleString(language, {
                timeZone: timezone,
                hour12:settings.hourCycle==='12',
              })}{" "}
            {x.end_at &&
              " — " +
                new Date(x.end_at).toLocaleString(language, {
                  timeZone: timezone,
                  hour12:settings.hourCycle==='12',
                })}
          </small>
        </li>
      ))}
    </ul>
  );
}
type Dashboard = { date: string; timezone: string; tasks: Item[]; events: Item[] };
const itemUrl = (item: Item) => `/projects/${item.project_id}${item.type === "projects" ? "" : `/${item.type}/${item.id}`}`;

export function Workspace() {
  const {language} = useI18n();
  const settings = useSettings();
  const [range, setRange] = useState<{ from: string; to: string }>();
  const [selection,setSelection]=useState<{start:string;end:string}>();
  const [created,setCreated]=useState<CalendarEvent>();
  const [filter, setFilter] = useState("all");
  const config = useQuery({ queryKey: ["config"], queryFn: () => api<{ timezone: string }>("/config") });
  const dashboard = useQuery({
    queryKey: ["workspace", range],
    queryFn: () => api<Dashboard>("/workspace?" + new URLSearchParams(range!)),
    enabled: !!range,
  });
  const recent = useQuery({ queryKey: ["recent"], queryFn: () => api<Item[]>("/recent") });
  const data = dashboard.data;
  const tasks = (data?.tasks ?? []).filter(item => filter === "all" || (filter === "overdue" ? !!item.due_date && item.due_date < data!.date : item.due_date === data!.date));
  const overdue = (data?.tasks ?? []).filter(item => item.due_date && item.due_date < data!.date).length;
  const zone = config.data?.timezone;
  return <section className="desk workbench" aria-label={tr("工作台")}>
    <header className="desk-header"><div><h1>{tr("工作台")}</h1></div><span className="workbench-summary">{data ? tr("{count} 项待推进",{count:data.tasks.length}) + (overdue ? tr(" · {count} 项逾期",{count:overdue}) : "") : tr("项目、行动与时间")}</span></header>
    <section className="workbench-calendar" aria-label={tr("日程日历")}>
      <header className="desk-section-heading"><h2>{tr("日程")}</h2><span>{tr("所有未归档项目")}</span></header>
      {config.isError ? <p role="alert" className="desk-error">{tr("日历配置加载失败")} <button onClick={() => void config.refetch()}>{tr("重试")}</button></p> : !zone ? <p role="status" className="desk-empty">{tr("正在加载日历…")}</p> : <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, luxonPlugin,interactionPlugin]}
        locale={language==='zh-CN'?zhCN:'en'} timeZone={zone} initialView={settings.calendarView} firstDay={settings.firstDay}
        eventTimeFormat={calendarTimeFormat(settings.hourCycle)} slotLabelFormat={calendarTimeFormat(settings.hourCycle)}
        headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek" }}
        buttonText={{ today: tr("今天"), month: tr("月"), week: tr("周") }}
        height="auto" dayMaxEvents={3} eventDisplay="block"
        selectable selectMirror
        dateClick={info=>{if(!info.allDay)return;const parsed=DateTime.fromISO(info.dateStr,{zone});const start=info.allDay?parsed.set({hour:9}):parsed;setSelection({start:start.toISO()!,end:start.plus({minutes:settings.eventDuration}).toISO()!});setCreated(undefined);}}
        select={info=>{const parsed=DateTime.fromISO(info.startStr,{zone});const start=info.allDay?parsed.set({hour:9}):parsed;setSelection({start:start.toISO()!,end:(info.allDay?start.plus({minutes:settings.eventDuration}):DateTime.fromISO(info.endStr,{zone})).toISO()!});setCreated(undefined);}}
        datesSet={info => setRange(old => old?.from === info.startStr && old.to === info.endStr ? old : { from: info.startStr, to: info.endStr })}
        events={(data?.events ?? []).map(item => ({ id: item.id, title: item.title, start: item.start_at, end: item.end_at, url: itemUrl(item), extendedProps: { project: item.project_title } }))}
        eventContent={info => <><span className="workbench-event-time">{info.timeText}</span><span className="workbench-event-title" title={`${info.event.title} · ${info.event.extendedProps.project}`}>{info.event.title}<small>{info.event.extendedProps.project}</small></span></>}
      />}
      {dashboard.isFetching && <p role="status" className="calendar-status">{tr("正在同步日程…")}</p>}
      {dashboard.isError && <p role="alert" className="desk-error">{tr("工作台加载失败")} <button onClick={() => void dashboard.refetch()}>{tr("重试")}</button></p>}
      {data && !dashboard.isFetching && !data.events.length && <p className="desk-empty">{tr("此日期范围暂无日程，点击日期或选择时段添加。")}</p>}
    </section>
    {selection&&zone&&<WorkspaceEventCreate selection={selection} zone={zone} onClose={()=>setSelection(undefined)} onCreated={event=>{setSelection(undefined);setCreated(event);}}/>}
    {created&&<p role="status" className="workbench-create-status">{tr("日程已创建")}<Link to={`/projects/${created.project_id}/events/${created.id}`}>{tr("查看日程")}</Link></p>}
    <section className="workbench-tasks" aria-label={tr("任务列表")}>
      <header className="workbench-task-heading"><div><h2>{tr("任务")}</h2><span>{tr("跨项目推进每一步")}</span></div><div role="group" aria-label={tr("任务范围")}>{[["all", tr("全部未完成")], ["overdue", tr("逾期")], ["today", tr("今日到期")]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></header>
      {!data ? <p className="desk-empty">{dashboard.isError ? tr("暂时无法加载任务，请重试。") : tr("正在加载任务…")}</p> : tasks.length ? <ul className="desk-task-list">{tasks.map(item => <li key={item.id}><Link to={itemUrl(item)} className="desk-task-row"><span className={`stage-dot ${item.stage ?? "todo"}`} aria-hidden="true"/><span className="desk-row-content"><strong>{item.title}</strong><small>{item.project_title}{item.parent_title ? ` / ${item.parent_title}` : ""}</small></span><time className={item.due_date && item.due_date < data.date ? "task-overdue" : ""}>{item.due_date ?? tr("未设日期")}</time><span className="desk-arrow" aria-hidden="true">↗</span></Link></li>)}</ul> : <p className="desk-empty">{filter === "all" ? tr("暂无未完成任务，前往项目安排下一步行动。") : filter === "overdue" ? tr("没有逾期任务。") : tr("今日没有到期任务。")}</p>}
    </section>
    <section className="desk-recent workbench-recent" aria-label={tr("最近访问")}><header className="desk-section-heading"><h2>{tr("最近访问")}</h2></header>
      {recent.isError ? <p role="alert" className="desk-error">{tr("最近访问加载失败")} <button onClick={() => void recent.refetch()}>{tr("重试")}</button></p> : recent.isPending ? <p role="status" className="desk-empty">{tr("正在加载…")}</p> : recent.data?.length ? <ul>{recent.data.slice(0,6).map(item => <li key={item.type + item.id}><Link to={itemUrl(item)}><span className="desk-recent-icon" aria-hidden="true">▤</span><span><strong>{item.title}</strong><small>{item.type === "projects" ? tr("项目") : item.project_title}</small></span></Link></li>)}</ul> : <p className="desk-empty">{tr("打开项目或笔记后，会在这里显示。")}</p>}
    </section>
  </section>;
}
