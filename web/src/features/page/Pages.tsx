import { ObjectProperties } from "../../components/object/ObjectProperties";
import { flushSync } from "react-dom";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../app/api";
import { MarkdownEditor } from "../../components/markdown/MarkdownEditor";
import { useAutosave } from "../../components/markdown/useAutosave";
export type Page = {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  body: string;
  position: number;
  version: number;
};
export function Pages({
  projectId,
  pageId,
  archived,
}: {
  projectId: string;
  pageId?: string;
  archived: boolean;
}) {
  const [params] = useSearchParams();
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (params.get("create") === "1" && !archived) titleInput.current?.focus(); }, [params, archived]);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [parent, setParent] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    setTitle("");
    setParent("");
  }, [projectId, pageId]);
  const [epoch, setEpoch] = useState(0);
  const list = useQuery({
    queryKey: ["pages", projectId],
    queryFn: () => api<Page[]>("/projects/" + projectId + "/pages"),
  });
  const detail = useQuery({
    queryKey: ["page", pageId],
    queryFn: () => api<Page>("/pages/" + pageId),
    enabled: !!pageId,
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["pages", projectId] }),
      qc.invalidateQueries({ queryKey: ["relation-options", projectId] }),
      qc.invalidateQueries({ queryKey: ["relations"] }),
    ]);
  const nodes = list.data ?? [];
  const flat: { page: Page; depth: number }[] = [];
  const stack = nodes
    .filter((n) => !n.parent_id)
    .sort((a, b) => b.position - a.position || b.id.localeCompare(a.id))
    .map((page) => ({ page, depth: 0 }));
  const seen = new Set<string>();
  while (stack.length) {
    const item = stack.pop()!;
    if (seen.has(item.page.id)) continue;
    seen.add(item.page.id);
    flat.push(item);
    const children = nodes
      .filter((n) => n.parent_id === item.page.id)
      .sort((a, b) => b.position - a.position || b.id.localeCompare(a.id));
    for (const page of children) stack.push({ page, depth: item.depth + 1 });
  }
  return (
    <div className={"page-workspace " + (pageId ? "object-detail-page" : "")}>
      {!pageId && <section className="page-tree" aria-label="笔记树">
        <h2>笔记</h2>
        {flat.map(({ page, depth }) => (
          <Link
            style={{ paddingLeft: Math.min(depth, 12) * 12 }}
            key={page.id}
            to={"/projects/" + projectId + "/pages/" + page.id}
          >
            {page.title}
          </Link>
        ))}
        {list.isError && (
          <p role="alert">
            笔记加载失败<button onClick={() => list.refetch()}>重试</button>
          </p>
        )}
        {!archived && (
          <form
            data-dirty={!!title.trim() || !!parent || creating}
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setCreating(true);
              try {
                const p = await api<Page>(
                  "/projects/" + projectId + "/pages",
                  "POST",
                  { title, parent_id: parent || null },
                );
                flushSync(() => {
                  setTitle("");
                  setParent("");
                  setCreating(false);
                });
                await refresh();
                nav("/projects/" + projectId + "/pages/" + p.id);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setCreating(false);
              }
            }}
          >
            <input
              disabled={creating}
              ref={titleInput}
              aria-label="新笔记标题"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="笔记标题"
            />
            <select
              disabled={creating}
              aria-label="新笔记父级"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">顶层笔记</option>
              {flat.map(({ page }) => (
                <option key={page.id} value={page.id}>
                  {page.title}
                </option>
              ))}
            </select>
            <button disabled={creating || !title.trim()}>新建笔记</button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </section>}
      <section>
        {pageId && <Link className="object-back" to={`/projects/${projectId}/pages`}>← 返回笔记列表</Link>}
        {pageId ? (
          detail.data && detail.data.project_id === projectId ? (
            <>
              <PageEditor
                key={pageId + ":" + epoch}
                page={detail.data}
                archived={archived}
                onSave={async (draft, version) => {
                  const next = await api<Page>("/pages/" + pageId, "PATCH", {
                    ...draft,
                    version,
                  });
                  qc.setQueryData(["page", pageId], next);
                  await refresh();
                }}
                onReload={async () => {
                  await detail.refetch({ throwOnError: true });
                  setEpoch((n) => n + 1);
                }}
              />
            </>
          ) : detail.isError ? (
            <p role="alert">
              笔记加载失败<button onClick={() => detail.refetch()}>重试</button>
            </p>
          ) : (
            <p>加载笔记…</p>
          )
        ) : (
          <p>选择或新建笔记，开始记录。</p>
        )}
      </section>
    </div>
  );
}
function PageEditor({
  page,
  archived,
  onSave,
  onReload,
}: {
  page: Page;
  archived: boolean;
  onSave: (d: { title: string; body: string }, v: number) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const a = useAutosave(
    { title: page.title, body: page.body },
    page.version,
    onSave,
    archived,
  );
  const [error, setError] = useState("");
  return (
    <article
      className="editor"
      aria-label="笔记详情"
      data-dirty={a.dirty || a.busy}
    >
      <header className="task-inline-header">
        <h2 aria-label={a.draft.title}><input className="task-inline-title" aria-label="笔记标题" disabled={archived} value={a.draft.title} onChange={e => a.setDraft(d => ({ ...d, title: e.target.value }))}/></h2>
        <ObjectProperties projectId={page.project_id} type="pages" id={page.id} version={page.version} archived={archived}/>
      </header>
      <MarkdownEditor
        projectId={page.project_id}
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
          <button onClick={() => a.save()} disabled={a.busy || !a.dirty}>
            保存笔记
          </button>
        )}
      </div>
      {(a.error || error) && (
        <div role="alert">
          {a.error || error}
          <p>本地草稿已保留。</p>
          <button onClick={() => a.save()}>重试保存</button>
          <button
            onClick={() =>
              navigator.clipboard
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
