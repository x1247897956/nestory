import { DateTime } from "luxon";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../app/api";
export type Item = {
  id: string;
  type: string;
  title: string;
  project_id: string;
  project_title: string;
  parent_title?: string;
  path?: string;
  archived: boolean;
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
                  projects: "项目",
                  tasks: "任务",
                  pages: "笔记",
                  events: "日程",
                } as Record<string, string>
              )[x.type]
            }{" "}
            · {x.project_title}
            {x.parent_title && " / " + x.parent_title}
            {x.path && " / " + x.path}
            {x.archived && " · 已归档"} {x.due_date}{" "}
            {x.start_at &&
              new Date(x.start_at).toLocaleString("zh-CN", {
                timeZone: timezone,
              })}{" "}
            {x.end_at &&
              " — " +
                new Date(x.end_at).toLocaleString("zh-CN", {
                  timeZone: timezone,
                })}
          </small>
        </li>
      ))}
    </ul>
  );
}
type Today = { date: string; timezone: string; today: Item[]; overdue: Item[]; events: Item[] };
const itemUrl = (item: Item) => `/projects/${item.project_id}${item.type === "projects" ? "" : `/${item.type}/${item.id}`}`;

export function Workspace() {
  const today = useQuery({ queryKey: ["today"], queryFn: () => api<Today>("/workspace/today") });
  const recent = useQuery({ queryKey: ["recent"], queryFn: () => api<Item[]>("/recent") });
  const data = today.data;
  const overdue = data?.overdue ?? [], due = data?.today ?? [], events = data?.events ?? [];
  const attention = overdue.length + due.length;
  const timeLabel = (iso: string) => {
    const value = DateTime.fromISO(iso).setZone(data?.timezone ?? "Asia/Shanghai");
    return value.toFormat(value.toISODate() === data?.date ? "HH:mm" : "M/d HH:mm");
  };
  const taskRows = (items: Item[]) => <ul className="desk-task-list">{items.map(item => <li key={item.id}>
    <Link to={itemUrl(item)} className="desk-task-row"><span className="desk-task-mark" aria-hidden="true" /><span className="desk-row-content"><strong>{item.title}</strong><small>{item.project_title}{item.parent_title ? ` / ${item.parent_title}` : ""}</small></span><time>{item.due_date}</time><span className="desk-arrow" aria-hidden="true">↗</span></Link>
  </li>)}</ul>;

  return <section className="desk" aria-label="今日工作台">
    <header className="desk-header"><div><span className="desk-date">{data ? DateTime.fromISO(data.date).setLocale("zh-cn").toFormat("M月d日 · cccc") : "正在加载日期…"}</span><h1>今日工作台</h1></div></header>
    {today.isError && <p className="desk-error" role="alert">工作台刷新失败{data ? "，当前内容仍保留。" : "。"}<button onClick={() => void today.refetch()}>重试</button></p>}
    <div className="desk-layout">
      <section className="desk-focus" aria-label="优先处理" aria-busy={today.isPending}>
        <header className="desk-focus-heading"><div><span className="desk-kicker">优先处理</span><h2>{today.isPending ? "正在整理待办…" : today.isError && !data ? "暂时无法加载" : attention ? `${attention} 项需要关注` : "今天没有到期任务"}</h2></div><span className="desk-focus-symbol" aria-hidden="true">↗</span></header>
        <div className="desk-focus-body">
          {today.isPending ? <p role="status" className="desk-empty">正在加载待处理任务…</p> : !data ? <p className="desk-empty">请重试以获取今天的任务。</p> : <>
            <div className="desk-group-title"><h3>逾期任务</h3><span className={overdue.length ? "desk-count urgent" : "desk-count"}>{overdue.length}</span></div>
            {overdue.length ? taskRows(overdue) : <p className="desk-empty">没有逾期任务。</p>}
            <div className="desk-group-title today-group"><h3>今日到期</h3><span className="desk-count">{due.length}</span></div>
            {due.length ? taskRows(due) : <p className="desk-empty">今日没有到期任务，可以继续推进项目。</p>}
          </>}
        </div>
      </section>
      <div className="desk-secondary">
        <section className="desk-schedule" aria-label="今日日程"><header className="desk-section-heading"><h2>今日日程</h2><span className="desk-count">{events.length}</span></header>
          {today.isPending ? <p role="status" className="desk-empty">正在加载日程…</p> : !data ? <p className="desk-empty">日程暂时不可用。</p> : events.length ? <ol className="desk-timeline">{events.map(item => <li key={item.id}><Link to={itemUrl(item)}><time>{timeLabel(item.start_at!)}<small>{timeLabel(item.end_at!)}</small></time><span><strong>{item.title}</strong><small>{item.project_title}</small></span></Link></li>)}</ol> : <p className="desk-empty">今天没有日程安排。</p>}
        </section>
        <section className="desk-recent" aria-label="最近访问"><header className="desk-section-heading"><h2>最近访问</h2></header>
          {recent.isError && <p role="alert" className="desk-error">最近访问加载失败<button onClick={() => void recent.refetch()}>重试</button></p>}
          {recent.isPending ? <p role="status" className="desk-empty">加载最近访问…</p> : recent.data?.length ? <ul>{recent.data.slice(0,6).map(item => <li key={item.type + item.id}><Link to={itemUrl(item)}><span className="desk-recent-icon" aria-hidden="true">{item.type === "projects" ? "▦" : "▤"}</span><span><strong>{item.title}</strong><small>{item.type === "projects" ? "项目" : item.project_title}</small></span><span className="desk-arrow" aria-hidden="true">↗</span></Link></li>)}</ul> : !recent.isError && <p className="desk-empty">打开项目或笔记后，会在这里留下快捷入口。</p>}
        </section>
      </div>
    </div>
  </section>;
}
