import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../app/api";
type Batch = {
  id: string;
  type: string;
  title: string;
  count: number;
  deleted_at: number;
  archived: boolean;
  members: { id: string; title: string }[];
};
export function Trash() {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const r = useQuery({
    queryKey: ["trash"],
    queryFn: () => api<Batch[]>("/trash"),
  });
  return (
    <section className="global-view">
      <h1>回收站</h1>
      {r.isError && (
        <p role="alert">
          加载失败<button onClick={() => r.refetch()}>重试</button>
        </p>
      )}
      {r.data?.map((x) => (
        <article key={x.id}>
          <h2>{x.title}</h2>
          <p>
            {x.type} · {x.count} 个对象 ·{" "}
            {new Date(x.deleted_at).toLocaleString()}
          </p>
          {x.archived && <p>项目已归档，请先取消归档再恢复。</p>}
          <details>
            <summary>查看批次成员</summary>
            <ul>
              {x.members.map((m) => (
                <li key={m.id}>{m.title}</li>
              ))}
            </ul>
          </details>
          <button
            disabled={busy || x.archived}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("/trash/" + x.id + "/restore", "POST");
                await qc.invalidateQueries();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            恢复 {x.title}
          </button>
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
