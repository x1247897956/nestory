import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, stages } from "../../app/api";
import { displayTime } from "../event/time";
type Item = {
  id: string;
  type: string;
  title: string;
  path?: string;
  stage?: string;
  start_at?: string;
  end_at?: string;
  kind?: string;
  left_id?: string;
  right_id?: string;
  deleted: boolean;
};
export function Relations({
  projectId,
  type,
  id,
  archived,
}: {
  projectId: string;
  type: "tasks" | "pages" | "events";
  id: string;
  archived: boolean;
}) {
  const popover = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!popover.current?.contains(event.target as Node) && popover.current) popover.current.open = false; };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<{ timezone: string }>("/config"),
  });
  const options = useQuery({
    queryKey: ["relation-options", projectId],
    queryFn: () => api<Item[]>("/projects/" + projectId + "/relation-options"),
  });
  const relations = useQuery({
    queryKey: ["relations", type, id],
    queryFn: () => api<Item[]>("/" + type + "/" + id + "/relations"),
  });
  const zone = config.data?.timezone;
  const label = (item: Item) =>
    item.deleted
      ? "已删除 · " + item.title
      : item.type === "pages"
        ? (options.data?.find((x) => x.id === item.id)?.path ??
          item.path ??
          item.title)
        : item.type === "tasks"
          ? item.title +
            " · " +
            (stages.find((x) => x[0] === item.stage)?.[1] ?? item.stage)
          : item.title +
            " · " +
            (zone && item.start_at && item.end_at
              ? displayTime(item.start_at, zone) +
                " — " +
                displayTime(item.end_at, zone)
              : "加载时间…");
  const list = relations.data ?? [];
  const candidates = (options.data ?? []).filter(
    (x) =>
      x.type !== type &&
      !list.some((y) => y.id === x.id) &&
      x.title.toLowerCase().includes(search.toLowerCase()),
  );
  const change = async (path: string, method: string) => {
    setBusy(true);
    setError("");
    try {
      await api("/relations/" + path, method);
      await qc.invalidateQueries({ queryKey: ["relations"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details ref={popover} className="relation-property" onKeyDown={event => { if (event.key === "Escape" && popover.current) { popover.current.open = false; popover.current.querySelector("summary")?.focus(); } }}>
      <summary aria-label="关联对象">关联 <span>{relations.isPending ? "…" : relations.isError ? "!" : list.length}</span><span aria-hidden="true">⌄</span></summary>
      <section className="relation-popover" aria-label="关联对象列表">
      <header><h3>关联对象</h3></header>
      {relations.isPending && <p role="status">正在加载关联…</p>}
      {!relations.isPending && !relations.isError && !list.length && <p className="relation-empty">暂无关联</p>}
      {list.map((item) => (
        <div className="relation-row" key={item.type + item.id}>
          {item.deleted ? (
            <span>{label(item)}</span>
          ) : (
            <Link
              to={"/projects/" + projectId + "/" + item.type + "/" + item.id}
            >
              {label(item)}
            </Link>
          )}
          {!archived && !item.deleted && (
            <button
              disabled={busy}
              aria-label={"移除关联 " + item.title}
              onClick={() =>
                void change(
                  item.kind + "/" + item.left_id + "/" + item.right_id,
                  "DELETE",
                )
              }
            >
              移除关联
            </button>
          )}
        </div>
      ))}
      {(relations.isError || options.isError || config.isError) && (
        <p role="alert">
          关联加载失败
          <button
            onClick={() => {
              void relations.refetch();
              void options.refetch();
              void config.refetch();
            }}
          >
            重试
          </button>
        </p>
      )}
      {!archived && (
        <div className="relation-controls">
          <input
            aria-label="搜索关联标题"
            placeholder="搜索同项目对象"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {options.isPending && <p role="status">正在加载…</p>}
          {!options.isPending && !options.isError && !relations.isPending && !relations.isError && !candidates.length && <p className="relation-empty">{search ? "没有匹配的对象" : "没有可关联的对象"}</p>}
          <div className="relation-candidates" aria-label="可关联对象">
            {!relations.isPending && !relations.isError && candidates.map(item => <button
              key={item.type + item.id} type="button" disabled={busy}
              aria-label={"关联 " + label(item)}
              onClick={() => {
                const rank = { tasks: 0, pages: 1, events: 2 };
                const left = rank[type] < rank[item.type as keyof typeof rank];
                const names: Record<string,string> = { tasks: "task", pages: "page", events: "event" };
                void change(left
                  ? `${names[type]}-${names[item.type]}/${id}/${item.id}`
                  : `${names[item.type]}-${names[type]}/${item.id}/${id}`, "PUT");
              }}>
              <span><span className="relation-candidate-title">{item.title}</span><small>{item.type === "pages" ? "笔记" : item.type === "events" ? "日程" : "任务"}</small></span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
            </button>)}
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
    </details>
  );
}
