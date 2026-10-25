import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, stages, type Task } from "../../app/api";
import { displayTime } from "../event/time";

type Item = { id: string; type: string; title: string; path?: string; start_at?: string; end_at?: string };
const isOpen = (task: Task) => task.stage !== "done" && task.stage !== "cancelled";
const stageNames = new Map<string, string>(stages);

function OverviewIcon({kind}:{kind:"tasks"|"pages"|"events"}) {
 const path=kind==="tasks"?"M7 10l2 2 4-4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z":kind==="pages"?"M5 3h7l3 3v11H5ZM8 9h4M8 12h4M8 15h3":"M4 5h12v12H4ZM7 3v4m6-4v4M4 9h12";
 return <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;
}

export function ProjectOverview({ projectId, tasks, loadingTasks, tasksError, retryTasks, archived, onCreateTask }: {
  projectId: string; tasks: Task[]; loadingTasks: boolean; tasksError: boolean;
  retryTasks: () => void; archived: boolean; onCreateTask: () => void;
}) {
  // Independent requests run in parallel and reuse the detail views' query cache.
  const objects = useQuery({ queryKey: ["relation-options", projectId], queryFn: () => api<Item[]>(`/projects/${projectId}/relation-options`) });
  const config = useQuery({ queryKey: ["config"], queryFn: () => api<{ timezone: string }>("/config") });
  const base = `/projects/${projectId}`;
  const pages = (objects.data ?? []).filter(item => item.type === "pages");
  const now = Date.now();
  const events = (objects.data ?? []).filter(item => item.type === "events").sort((a, b) => {
    const upcomingA = Date.parse(a.end_at!) > now, upcomingB = Date.parse(b.end_at!) > now;
    if (upcomingA !== upcomingB) return upcomingA ? -1 : 1;
    return upcomingA ? Date.parse(a.start_at!) - Date.parse(b.start_at!) : Date.parse(b.start_at!) - Date.parse(a.start_at!);
  });
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const recentTasks = [...tasks].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.updated_at - a.updated_at || a.id.localeCompare(b.id));
  const objectsError = objects.isError ? <p role="alert" className="overview-error">内容刷新失败 <button onClick={() => void objects.refetch()}>重试</button></p> : null;

  return <section className="project-overview" aria-label="项目汇总">
    <div className="overview-grid">
      <article className="overview-card">
        <header><div className="overview-section-title"><span className="section-icon"><OverviewIcon kind="tasks"/></span><h3><Link to={`${base}/tasks`}>任务</Link></h3><b>{loadingTasks ? "…" : tasks.length}</b></div><div className="overview-section-actions">{!archived && <button onClick={onCreateTask}>创建任务</button>}<Link className="section-open" to={`${base}/tasks`}>查看全部任务 <span aria-hidden="true">→</span></Link></div></header>
        {tasksError && <p role="alert" className="overview-error">任务刷新失败 <button onClick={retryTasks}>重试</button></p>}
        {loadingTasks ? <p role="status">正在加载任务…</p> : tasksError && !tasks.length ? null : recentTasks.length ? <ul>{recentTasks.slice(0, 5).map(task => {
          const parent = task.parent_id ? taskById.get(task.parent_id) : undefined;
          return <li key={task.id}><Link to={`${base}/tasks/${task.id}`}><i className={"stage-dot " + task.stage} /><span>{task.title}<small>{parent ? `子任务 · ${parent.title}` : stageNames.get(task.stage)}</small></span><time>{task.due_date ?? ""}</time><span className="row-arrow" aria-hidden="true">↗</span></Link></li>;
        })}</ul> : <p className="overview-empty">暂无任务，添加第一项行动。</p>}
      </article>
      <article className="overview-card">
        <header><div className="overview-section-title"><span className="section-icon"><OverviewIcon kind="pages"/></span><h3><Link to={`${base}/pages`}>笔记</Link></h3><b>{objects.isPending ? "…" : pages.length}</b></div><div className="overview-section-actions">{!archived && <Link className="overview-create" to={`${base}/pages?create=1`}>创建笔记</Link>}<Link className="section-open" to={`${base}/pages`}>查看全部笔记 <span aria-hidden="true">→</span></Link></div></header>
        {objectsError}
        {objects.isPending ? <p role="status">正在加载笔记…</p> : objects.isError && !objects.data ? null : pages.length ? <ul>{pages.slice(0, 5).map(note => <li key={note.id}><Link to={`${base}/pages/${note.id}`}><span className="overview-object-icon" aria-hidden="true">▤</span><span>{note.title}</span><span className="row-arrow" aria-hidden="true">↗</span></Link></li>)}</ul> : <p className="overview-empty">暂无笔记，记录第一份想法。</p>}
      </article>
      <article className="overview-card">
        <header><div className="overview-section-title"><span className="section-icon"><OverviewIcon kind="events"/></span><h3><Link to={`${base}/events`}>日程</Link></h3><b>{objects.isPending ? "…" : events.length}</b></div><div className="overview-section-actions">{!archived && <Link className="overview-create" to={`${base}/events?create=1`}>创建日程</Link>}<Link className="section-open" to={`${base}/events`}>打开日历 <span aria-hidden="true">→</span></Link></div></header>
        {objectsError}
        {config.isError && <p role="alert" className="overview-error">时区加载失败，暂显示原始时间。<button onClick={() => void config.refetch()}>重试</button></p>}
        {objects.isPending ? <p role="status">正在加载日程…</p> : objects.isError && !objects.data ? null : events.length ? <ul>{events.slice(0, 5).map(event => <li key={event.id}><Link to={`${base}/events/${event.id}`}><span className="overview-object-icon" aria-hidden="true">◷</span><span>{event.title}<small>{config.data ? `${displayTime(event.start_at!, config.data.timezone)} — ${displayTime(event.end_at!, config.data.timezone)}` : `${event.start_at} — ${event.end_at}`}</small></span><span className="row-arrow" aria-hidden="true">↗</span></Link></li>)}</ul> : <p className="overview-empty">暂无日程，为项目安排时间。</p>}
      </article>
    </div>
  </section>;
}
