import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../app/api";
import { ItemList, type Item } from "../workspace/Workspace";
export function Search() {
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const r = useQuery({
    queryKey: ["search", q, archived, offset],
    queryFn: () =>
      api<{ items: Item[]; total: number }>(
        "/search?q=" +
          encodeURIComponent(q) +
          "&include_archived=" +
          archived +
          "&offset=" +
          offset +
          "&limit=20",
      ),
  });
  return (
    <section className="global-view">
      <h1>搜索</h1>
      <input
        aria-label="搜索标题与正文"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOffset(0);
        }}
        placeholder="搜索标题与正文"
      />
      <label>
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => {
            setArchived(e.target.checked);
            setOffset(0);
          }}
        />
        包含归档
      </label>
      {r.isError && (
        <p role="alert">
          搜索失败<button onClick={() => r.refetch()}>重试</button>
        </p>
      )}
      <ItemList items={r.data?.items ?? []} />
      <p>{r.data?.total ?? 0} 条结果</p>
      <button disabled={offset === 0} onClick={() => setOffset((v) => v - 20)}>
        上一页
      </button>
      <button
        disabled={offset + 20 >= (r.data?.total ?? 0)}
        onClick={() => setOffset((v) => v + 20)}
      >
        下一页
      </button>
    </section>
  );
}
