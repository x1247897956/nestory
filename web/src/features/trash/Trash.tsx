import {t, useI18n, translateError} from "../../i18n";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../app/api";
import {useSettings} from "../settings/preferences";
type Batch = {
  id: string;
  type: string;
  title: string;
  count: number;
  deleted_at: number;
  archived: boolean;
  members: { id: string; title: string }[];
};
const names: Record<string, string> = {
  projects: "项目",
  tasks: "任务",
  pages: "笔记",
  events: "日程",
};
export function Trash() {
  const {language} = useI18n();
  const settings=useSettings();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const r = useQuery({
    queryKey: ["trash"],
    queryFn: () => api<Batch[]>("/trash"),
  });
  return (
    <section className="global-view trash-view" aria-label={t("回收站")}>
      <header className="trash-heading">
        <h1>{t("回收站")}</h1>
        {r.data && <span>{t("{count} 条记录", {count: r.data.length})}</span>}
      </header>
      {r.isPending && (
        <p role="status" className="trash-message">
          {t("正在加载…")}</p>
      )}
      {r.isError && (
        <p role="alert" className="trash-message">
          {t("回收站加载失败")}<button onClick={() => r.refetch()}>{t("重试")}</button>
        </p>
      )}
      {r.isSuccess && !r.data.length && (
        <p className="trash-message">{t("回收站为空")}</p>
      )}
      {!!r.data?.length && (
        <ul className="trash-list" aria-label={t("已删除的对象")}>
          {r.data.map((x) => (
            <li key={x.id} className="trash-item">
              <div className="trash-row">
                <button
                  className="trash-title"
                  title={x.title}
                  aria-expanded={expanded === x.id}
                  aria-controls={"trash-members-" + x.id}
                  onClick={() => setExpanded(expanded === x.id ? null : x.id)}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    <path
                      d="m6 4 4 4-4 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <span>{x.title}</span>
                </button>
                <span className="trash-kind">{names[x.type] ? t(names[x.type]) : x.type}</span>
                <span className="trash-count">{t("{count} 个对象", {count: x.count})}</span>
                <time
                  dateTime={new Date(x.deleted_at).toISOString()}
                  title={new Date(x.deleted_at).toLocaleString(language, {hour12: settings.hourCycle === "12"})}
                >
                  {new Date(x.deleted_at).toLocaleString(language, {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: settings.hourCycle==='12',
                  })}
                </time>
                <button
                  className="trash-restore"
                  aria-label={t("恢复 {title}", {title: x.title})}
                  disabled={!!busy || x.archived}
                  onClick={async () => {
                    setBusy(x.id);
                    setError("");
                    try {
                      await api("/trash/" + x.id + "/restore", "POST");
                      await qc.invalidateQueries();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === x.id ? t("恢复中…") : t("恢复")}
                </button>
              </div>
              {x.archived && (
                <p className="trash-blocked">
                  {t("项目已归档，请先取消归档再恢复。")}</p>
              )}
              {expanded === x.id && (
                <ul
                  className="trash-members"
                  id={"trash-members-" + x.id}
                  aria-label={t("删除批次明细")}
                >
                  {x.members.map((m) => (
                    <li key={m.id}>{m.title}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="trash-message">
          {translateError(error)}
        </p>
      )}
    </section>
  );
}
