import type { BodyDocument } from "../../app/document";
import { ObjectProperties } from "../../components/object/ObjectProperties";
import { SaveIndicator } from "../../components/markdown/SaveIndicator";
import "./pages.css";
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
  body_document: BodyDocument;
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
  const qc = useQueryClient();
  const nav = useNavigate();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const attempted = useRef("");
  const createdId = useRef("");
  const retryParent = useRef<string | null>(null);
  const context = useRef({ projectId, pageId });
  context.current = { projectId, pageId };
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
  const createPage = async (parentId: string | null = null) => {
    if (pending.current || archived) return;
    pending.current = true;
    retryParent.current = parentId;
    setCreating(true);
    setError("");
    const originProject = projectId;
    try {
      const next = await api<Page>(
        "/projects/" + originProject + "/pages",
        "POST",
        {
          title: "无标题笔记",
          parent_id: parentId,
        },
      );
      qc.setQueryData(["page", next.id], next);
      void refresh();
      if (
        mounted.current &&
        context.current.projectId === originProject &&
        !context.current.pageId
      ) {
        createdId.current = next.id;
        nav("/projects/" + originProject + "/pages/" + next.id);
      }
    } catch (e) {
      if (mounted.current && context.current.projectId === originProject)
        setError((e as Error).message);
    } finally {
      pending.current = false;
      if (mounted.current) setCreating(false);
    }
  };
  useEffect(() => {
    if (params.get("create") !== "1" || pageId || archived) {
      attempted.current = "";
      return;
    }
    if (attempted.current === projectId) return;
    attempted.current = projectId;
    void createPage();
  }, [params, projectId, pageId, archived]);
  return (
    <div
      className={
        "page-workspace " +
        (pageId ? "object-detail-page" : "page-list-workspace")
      }
    >
      {!pageId && (
        <section className="page-tree" aria-label="笔记树">
          <header className="page-list-header">
            <h2>笔记</h2>
            {!archived && (
              <button disabled={creating} onClick={() => void createPage()}>
                新建笔记
              </button>
            )}
          </header>
          {error && (
            <p role="alert">
              {error}{" "}
              <button
                disabled={creating}
                onClick={() => void createPage(retryParent.current)}
              >
                重试新建
              </button>
            </p>
          )}
          <div className="page-list">
            {flat.map(({ page, depth }) => (
              <div
                className="page-list-row"
                key={page.id}
                style={{ paddingLeft: 16 + Math.min(depth, 12) * 20 }}
              >
                <Link to={"/projects/" + projectId + "/pages/" + page.id}>
                  {page.title}
                </Link>
                {!archived && (
                  <button
                    disabled={creating}
                    aria-label={"新建子笔记 " + page.title}
                    onClick={() => void createPage(page.id)}
                  >
                    新建子笔记
                  </button>
                )}
              </div>
            ))}
            {list.isLoading && <p className="page-list-empty">加载笔记…</p>}
            {!list.isLoading && !list.isError && !flat.length && (
              <p className="page-list-empty">
                还没有笔记，创建第一篇笔记开始记录。
              </p>
            )}
          </div>
          {list.isError && (
            <p role="alert">
              笔记加载失败<button onClick={() => list.refetch()}>重试</button>
            </p>
          )}
        </section>
      )}
      {pageId && (
        <section>
          {pageId && (
            <Link className="object-back" to={`/projects/${projectId}/pages`}>
              ← 返回笔记列表
            </Link>
          )}
          {pageId ? (
            detail.data && detail.data.project_id === projectId ? (
              <>
                <PageEditor
                  key={pageId + ":" + epoch}
                  page={detail.data}
                  archived={archived}
                  focusTitle={createdId.current === pageId}
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
                笔记加载失败
                <button onClick={() => detail.refetch()}>重试</button>
              </p>
            ) : (
              <p>加载笔记…</p>
            )
          ) : (
            <p>选择或新建笔记，开始记录。</p>
          )}
        </section>
      )}
    </div>
  );
}
function PageEditor({
  page,
  archived,
  onSave,
  onReload,
  focusTitle,
}: {
  page: Page;
  focusTitle: boolean;
  archived: boolean;
  onSave: (
    d: { title: string; body_document: BodyDocument },
    v: number,
  ) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const a = useAutosave(
    {
      title: page.title,
      body_document: page.body_document ?? { version: 1, blocks: [] },
    },
    page.version,
    onSave,
    archived,
    (draft) => !!draft.title.trim(),
  );
  const [error, setError] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusTitle && !archived) {
      titleInput.current?.focus();
      titleInput.current?.select();
    }
  }, [focusTitle, archived]);
  return (
    <article
      className="editor"
      aria-label="笔记详情"
      data-dirty={a.dirty || a.busy}
    >
      <header className="task-inline-header">
        <h2 aria-label={a.draft.title}>
          <input
            ref={titleInput}
            className="task-inline-title"
            aria-label="笔记标题"
            disabled={archived}
            value={a.draft.title}
            onChange={(e) =>
              a.setDraft((d) => ({ ...d, title: e.target.value }))
            }
          />
        </h2>
      </header>
      <ObjectProperties
        projectId={page.project_id}
        type="pages"
        id={page.id}
        version={page.version}
        archived={archived}
      />
      <MarkdownEditor
        projectId={page.project_id}
        body_document={a.draft.body_document}
        disabled={archived}
        onChange={(body_document) =>
          a.setDraft((d) => ({ ...d, body_document }))
        }
      />
      <SaveIndicator busy={a.busy} dirty={a.dirty} error={a.error} />
      {(a.error || error) && (
        <div role="alert">
          {a.error || error}
          <p>本地草稿已保留。</p>
          <button onClick={() => a.save()}>重试保存</button>
          <button
            onClick={() =>
              navigator.clipboard
                .writeText(JSON.stringify(a.draft.body_document, null, 2))
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
