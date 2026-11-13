import {t, useI18n, translateError} from "../../i18n";
import {TaskFilters} from "../task/TaskFilters";
import {useTaskFilters} from "../task/useTaskFilters";
import { CollectionHeader } from "../view/CollectionHeader";
import {SortControl} from "../view/SortControl";
import {useProjectPreferences} from "../view/preferences";
import {normalizeSort, noteSortFields, sortObjects, type SortSpec} from "../view/sorting";
import { ObjectDialog, useOverviewBackground } from "../../components/object/ObjectDialog";
import { ObjectMenu } from "../../components/object/ObjectMenu";
import type { BodyDocument } from "../../app/document";
import { ObjectProperties } from "../../components/object/ObjectProperties";
import {ObjectEditorHeader, ObjectEditorBody, ObjectEditorFooter} from "../../components/object/ObjectEditor";
import "./pages.css";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, abandonCreateIntent, recoverCreateInput } from "../../app/api";
import { LazyBlockEditor } from "../../components/editor/LazyBlockEditor";
import { useAutosave } from "../../components/editor/useAutosave";
export type Page = {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  body_document: BodyDocument;
  position: number;
  version: number;
  created_at?: number;
  updated_at?: number;
};
export type PageProperties = Omit<Page, "body_document">;
export function Pages({
  projectId,
  projectTitle = t("项目"),
  pageId,
  archived,
}: {
  projectId: string;
  projectTitle?: string;
  pageId?: string;
  archived: boolean;
}) {
  useI18n();
  const [sort, setSort] = useProjectPreferences<SortSpec>(projectId, "pages:sort", {field:"position",direction:"asc"}, raw => normalizeSort(raw, noteSortFields, {field:"position",direction:"asc"}));
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const overviewBackground=useOverviewBackground(projectId);
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
  const creationTitles = useRef<Record<string, string>>({});
  const createdId = useRef("");
  const context = useRef({ projectId, pageId });
  context.current = { projectId, pageId };
  const [epoch, setEpoch] = useState(0);
  const list = useQuery({
    queryKey: ["pages", projectId],
    queryFn: () => api<PageProperties[]>("/projects/" + projectId + "/pages?include_body=false"),
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
  // Legacy nested notes remain accessible, but the interface is a flat list.
  const filterState=useTaskFilters(projectId,nodes,true,'pages');
  const flat = sortObjects(nodes, sort).filter(page=>filterState.ids.has(page.id));
  const createPage = async () => {
    if (pending.current || archived) return;
    pending.current = true;
    setCreating(true);
    setError("");
    const originProject = projectId;
    try {
      const path="/projects/"+originProject+"/pages";
      const original=recoverCreateInput<{title:string;parent_id:null}>(path,input=>
        input.parent_id===null && ["无标题笔记","Untitled note"].includes(String(input.title)) &&
        Object.keys(input).every(key=>key==='title'||key==='parent_id'));
      const defaultTitle=creationTitles.current[projectId] ?? original?.title ?? t("无标题笔记");
      creationTitles.current[projectId]=defaultTitle;
      const next = await api<Page>(
        "/projects/" + originProject + "/pages",
        "POST",
        {
          title: defaultTitle,
          parent_id: null,
        },
      );
      delete creationTitles.current[originProject];
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
        "page-workspace page-list-workspace collection-workspace"
      }
    >
      {!overviewBackground && (
        <section className="page-tree" aria-label={t("笔记列表")} aria-hidden={pageId?true:undefined} inert={!!pageId}>
          <CollectionHeader title={t("笔记")} count={list.isPending?"…":nodes.length}
            actions={!archived&&<button disabled={creating||!!error} onClick={()=>void createPage()}>{t("新建笔记")}</button>}
            views={<div className="collection-view-switch"><span className="collection-current-view">{t("列表")}</span></div>}
            tools={<><TaskFilters key={projectId} state={filterState} label={t("笔记")}/><SortControl key={projectId} value={sort} onChange={setSort} fields={noteSortFields} label={t("笔记排序")}/></>}/>
          {error && (
            <p role="alert">
              {translateError(error)}{" "}
              <button
                disabled={creating}
                onClick={() => void createPage()}
              >
                {t("重试新建")}</button>
              <button disabled={creating} onClick={() => {
                if (!confirm(t("上次新建可能已经完成。放弃此次重试并允许另建笔记？"))) return;
                try {
                  abandonCreateIntent("/projects/" + projectId + "/pages", {title:creationTitles.current[projectId] ?? t("无标题笔记"),parent_id:null});
                  delete creationTitles.current[projectId];
                  setError("");
                } catch(e) { setError((e as Error).message); }
              }}>{t("放弃此次新建")}</button>
            </p>
          )}
          {filterState.filters.length>0&&!filterState.blocked&&<p className="task-filter-message">{t("{count} / {total} 篇笔记符合条件", {count: flat.length, total: nodes.length})}</p>}
          <div className="page-list">
            {flat.map((page) => (
              <div
                className="page-list-row"
                key={page.id}
                style={{ paddingLeft: 16 }}
              >
                <Link to={"/projects/" + projectId + "/pages/" + page.id}>
                  {page.title}
                </Link>

              </div>
            ))}
            {list.isLoading && <p className="page-list-empty">{t("加载笔记…")}</p>}
            {!list.isLoading && !list.isError && !filterState.blocked && !flat.length && (
              <p className="page-list-empty">
                {filterState.filters.length?<>{t("没有符合条件的笔记")}<button onClick={()=>filterState.setFilters([])}>{t("清除筛选")}</button></>:t("还没有笔记，创建第一篇笔记开始记录。")}
              </p>
            )}
          </div>
          {list.isError && (
            <p role="alert">
              {t("笔记加载失败")}<button onClick={() => list.refetch()}>{t("重试")}</button>
            </p>
          )}
        </section>
      )}
      {pageId && (
        <ObjectDialog projectId={projectId} projectTitle={projectTitle} type="pages" title={detail.data?.title ?? t("加载中…")}>
        <section>
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
                  onReload={async (beforeReset) => {
                    await detail.refetch({ throwOnError: true });
                    beforeReset?.();
                    setEpoch((n) => n + 1);
                  }}
                />
              </>
            ) : detail.isError ? (
              <p role="alert">
                {t("笔记加载失败")}<button onClick={() => detail.refetch()}>{t("重试")}</button>
              </p>
            ) : (
              <p>{t("加载笔记…")}</p>
            )
          ) : (
            <p>{t("选择或新建笔记，开始记录。")}</p>
          )}
        </section>
        </ObjectDialog>
      )}
    </div>
  );
}
export function PageEditor({
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
  onReload: (beforeReset?: () => void) => Promise<void>;
}) {
  useI18n();
  const a = useAutosave(
    {
      title: page.title,
      body_document: page.body_document ?? { version: 1, blocks: [] },
    },
    page.version,
    onSave,
    archived,
    (draft) => !!draft.title.trim(),
    `pages:${page.project_id}:${page.id}`,
  );
  const [error, setError] = useState("");
  const [bodyPending, setBodyPending] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusTitle && !archived) {
      const frame=requestAnimationFrame(()=>{titleInput.current?.focus();titleInput.current?.select();});
      return()=>cancelAnimationFrame(frame);
    }
  }, [focusTitle, archived]);
  return (
    <article
      className="editor"
      aria-label={t("笔记详情")}
      data-dirty={a.dirty || a.busy || bodyPending}
    >
      <ObjectEditorHeader title={a.draft.title} menu={<ObjectMenu type="pages" id={page.id} projectId={page.project_id} archived={archived}/>} properties={      <ObjectProperties
        projectId={page.project_id}
        type="pages"
        id={page.id}
        version={page.version}
        archived={archived}
      />}>
          <input
            ref={titleInput}
            className="task-inline-title"
            aria-label={t("笔记标题")}
            disabled={archived}
            value={a.draft.title}
            onChange={(e) =>
              a.setDraft((d) => ({ ...d, title: e.target.value }))
            }
          />
      </ObjectEditorHeader>

      <ObjectEditorBody>
      <LazyBlockEditor
        projectId={page.project_id}
        onPendingChange={setBodyPending}
        body_document={a.draft.body_document}
        disabled={archived}
        onChange={(body_document) =>
          a.setDraft((d) => ({ ...d, body_document }))
        }
      />
      </ObjectEditorBody>
      <ObjectEditorFooter busy={a.busy} dirty={a.dirty} error={translateError(a.error || error)} >
      {(a.error || error) && (
        <div role="alert">
          {translateError(a.error || error)}
          <p>{t("本地草稿已保留。")}</p>
          {a.canRecover && <button disabled={bodyPending || a.busy} onClick={() => { if (!bodyPending && !a.busy) a.recover(); }}>{t("恢复本机草稿")}</button>}
          <button onClick={() => a.save()}>{t("重试保存")}</button>
          <button
            onClick={() =>
              navigator.clipboard
                .writeText(JSON.stringify(a.draft.body_document, null, 2))
                .catch(() => setError("复制失败，请手动复制"))
            }
          >
            {t("复制草稿")}</button>
          <button
            disabled={bodyPending || a.busy}
            onClick={async () => {
              if (bodyPending || a.busy) return;
              if (confirm(t("重新载入会丢弃本地草稿，是否继续？")))
                try {
                  await onReload(a.discardRecovery);
                } catch (e) {
                  setError((e as Error).message);
                }
            }}
          >
            {t("重新载入")}</button>
        </div>
      )}
      </ObjectEditorFooter>
    </article>
  );
}
