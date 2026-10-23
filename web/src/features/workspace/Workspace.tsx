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
                  pages: "页面",
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
export function Workspace() {
  const today = useQuery({
    queryKey: ["today"],
    queryFn: () =>
      api<{
        date: string;
        timezone: string;
        today: Item[];
        overdue: Item[];
        events: Item[];
      }>("/workspace/today"),
  });
  const recent = useQuery({
    queryKey: ["recent"],
    queryFn: () => api<Item[]>("/recent"),
  });
  return (
    <section className="global-view">
      <h1>今日工作台</h1>
      <p>
        {today.data?.date} · {today.data?.timezone}
      </p>
      {today.isError && (
        <p role="alert">
          加载失败<button onClick={() => today.refetch()}>重试</button>
        </p>
      )}
      {(["today", "overdue", "events"] as const).map((k, i) => (
        <section key={k}>
          <h2>{["今日到期", "逾期任务", "今日日程"][i]}</h2>
          <ItemList
            items={today.data?.[k] ?? []}
            timezone={today.data?.timezone}
          />
        </section>
      ))}
      <h2>最近访问</h2>
      <ItemList items={recent.data ?? []} />
      {recent.isError && (
        <p role="alert">
          最近访问加载失败<button onClick={() => recent.refetch()}>重试</button>
        </p>
      )}
    </section>
  );
}
