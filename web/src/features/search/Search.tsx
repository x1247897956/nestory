import {t, useI18n} from "../../i18n";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../app/api";
import { ItemList, type Item } from "../workspace/Workspace";
export function Search() {
  useI18n();
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
      <h1>{t("搜索")}</h1>
      <input
        aria-label={t("搜索标题与正文")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOffset(0);
        }}
        placeholder={t("搜索标题与正文")}
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
        {t("包含归档")}</label>
      {r.isError && (
        <p role="alert">
          {t("搜索失败")}<button onClick={() => r.refetch()}>{t("重试")}</button>
        </p>
      )}
      <ItemList items={r.data?.items ?? []} />
      <p>{t("{count} 条结果", {count: r.data?.total ?? 0})}</p>
      <button disabled={offset === 0} onClick={() => setOffset((v) => v - 20)}>
        {t("上一页")}</button>
      <button
        disabled={offset + 20 >= (r.data?.total ?? 0)}
        onClick={() => setOffset((v) => v + 20)}
      >
        {t("下一页")}</button>
    </section>
  );
}
