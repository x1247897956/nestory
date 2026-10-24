import { flushSync } from "react-dom";
import { Workspace } from "../features/workspace/Workspace";
import { Search } from "../features/search/Search";
import { Trash } from "../features/trash/Trash";
import { useState, useEffect, useRef } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useBlocker,
  useLocation,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, stages, priorities, type Project, type Task } from "./api";
import { ProjectForm } from "../features/project/ProjectForm";
import { ProjectOverview } from "../features/project/ProjectOverview";
import { TaskSummary } from "../features/task/TaskSummary";
import { TaskEditor, type TaskDraft } from "../features/task/TaskEditor";
import "./styles.css";
import "./workspace.css";
import { Events } from "../features/event/Events";
import { Relations } from "../features/relation/Relations";
import { Pages } from "../features/page/Pages";
export function App() {
  const { projectId, taskId, pageId, eventId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [archived, setArchived] = useState(false);
  const activeProjectHeading = useRef<HTMLDivElement>(null);
  const [projectForm, setProjectForm] = useState<"new" | "edit" | null>(null);
  const [stage, setStage] = useState("all");
  const [priority, setPriority] = useState("all");
  const [group, setGroup] = useState(true);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newParent, setNewParent] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const createDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (createOpen) createDialog.current?.showModal();
  }, [createOpen]);
  const closeCreate = () => {
    if (creating) return;
    if ((newTitle.trim() || newParent) && !confirm("放弃未保存的新任务吗？")) return;
    setCreateOpen(false); setNewTitle(""); setNewParent("");
  };
  const openCreate = (parent = "") => {
    setNewParent(parent); setCreateOpen(true);
  };
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const blocker = useBlocker(
    () => !!document.querySelector('[data-dirty="true"]'),
  );
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (confirm("有未保存更改，仍要离开吗？")) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  const projects = useQuery({
    queryKey: ["projects", archived],
    queryFn: () => api<Project[]>("/projects?archived=" + archived),
  });
  const current = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<Project>("/projects/" + projectId),
    enabled: !!projectId,
  });
  const tasks = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () => api<Task[]>("/projects/" + projectId + "/tasks"),
    enabled: !!projectId,
  });
  const detail = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api<Task>("/tasks/" + taskId),
    enabled: !!taskId,
  });
  const path = useLocation().pathname;
  useEffect(() => {
    setNewTitle("");
    setNewParent("");
    setCreateOpen(false);
  }, [path]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (document.querySelector('[data-dirty="true"]')) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);
  const overview = !!projectId && path === "/projects/" + projectId;
  const notes = path.includes("/pages");
  const calendar = path.includes("/events");
  useEffect(() => {
    if (projectId && current.data)
      void api("/recent", "POST", { type: "project", id: projectId })
        .then(() => qc.invalidateQueries({ queryKey: ["recent"] }))
        .catch(() => {});
  }, [projectId, current.data?.id, qc]);
  useEffect(() => {
    if (pageId)
      void api("/recent", "POST", { type: "page", id: pageId })
        .then(() => qc.invalidateQueries({ queryKey: ["recent"] }))
        .catch(() => {});
  }, [pageId, qc]);
  useEffect(() => { activeProjectHeading.current?.scrollIntoView?.({ block: "nearest" }); }, [projectId, projects.data]);
  const p = current.data;
  const navigationProjects = [...(projects.data ?? [])];
  if (p && !navigationProjects.some(project => project.id === p.id)) navigationProjects.push(p);
  const all = tasks.data ?? [];
  const readOnly = !!p?.archived_at;
  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["projects"] }),
      qc.invalidateQueries({ queryKey: ["project", projectId] }),
      qc.invalidateQueries({ queryKey: ["tasks", projectId] }),
    ]);
  };
  const saveTask = async (draft: TaskDraft, version: number) => {
    const next = await api<Task>("/tasks/" + taskId, "PATCH", {
      ...draft,
      version,
    });
    qc.setQueryData(["task", taskId], next);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["tasks", projectId] }),
      qc.invalidateQueries({ queryKey: ["relation-options", projectId] }),
      qc.invalidateQueries({ queryKey: ["relations"] }),
    ]);
  };
  const openTask = (t: Task) => {
    nav("/projects/" + projectId + "/tasks/" + t.id);
  };
  const visible = (t: Task) =>
    (stage === "all" || t.stage === stage) &&
    (priority === "all" || t.priority === priority);
  const roots = all.filter((t) => !t.parent_id);
  const children = (id: string) => all.filter((t) => t.parent_id === id);
  const row = (t: Task, child = false) => (
    <div
      key={t.id}
      className={
        "task-row " +
        (child ? "child " : "") +
        (taskId === t.id ? "selected" : "")
      }
    >
      <span className={"stage-dot " + t.stage} />
      <button className="task-title" onClick={() => openTask(t)}>
        {t.title}
      </button>
      {t.due_date && <time>{t.due_date}</time>}
      {t.priority !== "none" && (
        <span className={"priority " + t.priority}>
          {priorities.find(([id]) => id === t.priority)?.[1]}
        </span>
      )}
      {!child && children(t.id).length > 0 && (
        <button
          className="expand"
          aria-label={"展开 " + t.title}
          onClick={() =>
            setExpanded((old) => {
              const n = new Set(old);
              if (n.has(t.id)) n.delete(t.id);
              else n.add(t.id);
              return n;
            })
          }
        >
          {expanded.has(t.id) ? "−" : "+"} {children(t.id).length}
        </button>
      )}
    </div>
  );
  const renderRoot = (t: Task) => (
    <div key={t.id}>
      {row(t)}
      {(expanded.has(t.id) || stage !== "all" || priority !== "all") &&
        children(t.id)
          .filter(visible)
          .map((c) => row(c, true))}
    </div>
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">n.</span>
          <span>
            Noteapp<small>个人工作空间</small>
          </span>
        </Link>
        <div className="sidebar-label">你的工作空间</div>
        <Link className="nav-item" to="/" aria-current={path === "/" ? "page" : undefined}>
          工作台
        </Link>
        <Link className="nav-item" to="/search" aria-current={path === "/search" ? "page" : undefined}>
          搜索
        </Link>
        <Link className="nav-item" to="/trash" aria-current={path === "/trash" ? "page" : undefined}>
          回收站
        </Link>
        <div className="sidebar-heading">
          <span>{archived ? "已归档" : "项目"} <span className="project-count">{projects.data?.length ?? 0}</span></span>
          <div className="project-heading-actions">
            <details className="project-options" onKeyDown={event => { if (event.key === "Escape") event.currentTarget.open = false; }}>
              <summary aria-label="项目选项">⋯</summary>
              <div><button onClick={event => { setArchived(!archived); event.currentTarget.closest("details")!.open = false; }}>{archived ? "返回项目列表" : "查看已归档项目"}</button></div>
            </details>
            <button aria-label="新建项目" onClick={() => setProjectForm("new")}>＋</button>
          </div>
        </div>
        <nav aria-label="项目列表">
          {navigationProjects.map(project => <div className="sidebar-project" key={project.id}>
            <div ref={project.id === projectId ? activeProjectHeading : undefined}>
              <Link className={"project-link " + (project.id === projectId ? "active" : "")} to={"/projects/" + project.id}>
                <span className="project-icon" aria-hidden="true">{project.title.slice(0, 1)}</span>
                <span>{project.title}</span>
              </Link>
            </div>
          </div>)}
        </nav>
        {projects.isError && (
          <p role="alert">
            项目加载失败{" "}
            <button onClick={() => projects.refetch()}>重试</button>
          </p>
        )}
        <button className="new-project" onClick={() => setProjectForm("new")}>
          ＋ 新建项目
        </button>
        <div className="sidebar-bottom">
          <span className="local-dot" /> 本地空间<br />
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>
            工作空间 <span className="slash">/</span>{" "}
            {projectId ? <><Link className="project-breadcrumb" to={"/projects/" + projectId} aria-label="汇总" aria-current={overview ? "page" : undefined}>{p?.title ?? "项目"}</Link><span className="slash">/</span><span>{overview ? "概览" : notes ? "笔记" : calendar ? "日程" : "任务"}</span></> : path === "/search" ? "搜索" : path === "/trash" ? "回收站" : "工作台"}
          </span>
          <span className="private-tag">本地 · 私有</span>
        </div>
        {!projectId ? (
          <>
            {path === "/search" ? (
              <Search />
            ) : path === "/trash" ? (
              <Trash />
            ) : (
              <Workspace />
            )}

          </>
        ) : current.isPending ? (
          <p className="loading">正在打开项目…</p>
        ) : current.isError && !current.data ? (
          <div className="error" role="alert">
            项目加载失败<button onClick={() => current.refetch()}>重试</button>
          </div>
        ) : (
          <>
            <header className="project-header">

              <div className="header-title">
                <h1>{p?.title}</h1>
                <div>
                  {!readOnly && (
                    <button onClick={() => setProjectForm("edit")}>
                      修改项目
                    </button>
                  )}{" "}
                  <button
                    onClick={async () => {
                      setError("");
                      try {
                        await api("/projects/" + projectId, "PATCH", {
                          version: p?.version,
                          archived: !readOnly,
                        });
                        await invalidate();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    {readOnly ? "取消归档" : "归档项目"}
                  </button>
                </div>
              </div>
              <p>
                {p?.description}
              </p>

            </header>
            {(current.isError || detail.isError) && (
              <p className="error" role="alert">
                刷新失败，当前草稿仍保留。请检查网络后重试。
              </p>
            )}
            {readOnly && (
              <div className="archive-banner">
                此项目已归档，内容只读。取消归档后可继续编辑。
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {overview ? (
              <ProjectOverview projectId={projectId} tasks={all} loadingTasks={tasks.isPending} tasksError={tasks.isError} retryTasks={() => void tasks.refetch()} archived={readOnly} />
            ) : calendar ? (
              <Events
                projectId={projectId}
                eventId={eventId}
                archived={readOnly}
              />
            ) : notes ? (
              <Pages
                projectId={projectId}
                pageId={pageId}
                archived={readOnly}
              />
            ) : (
              <div className={"workspace " + (taskId ? "task-summary-workspace" : "")}>
                {!taskId && <section className="task-list">
                  <div className="list-toolbar">
                    <div>
                      <h2>所有任务</h2>
                      <span>{all.length} 个任务，专注当下的一步</span>
                    </div>
                    <div className="task-toolbar-actions"><button onClick={() => setGroup(!group)}>
                      {group ? "取消分组" : "按阶段分组"}
                    </button>{!readOnly && <button className="primary" onClick={() => openCreate()}>添加任务</button>}</div>
                  </div>
                  <div className="filters">
                    <label>
                      筛选阶段
                      <select
                        value={stage}
                        onChange={(e) => setStage(e.target.value)}
                      >
                        <option value="all">全部阶段</option>
                        {stages.map(([id, name]) => (
                          <option value={id} key={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      筛选优先级
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                      >
                        <option value="all">全部优先级</option>
                        {priorities.map(([id, name]) => (
                          <option value={id} key={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {tasks.isError ? (
                    <div role="alert">
                      任务加载失败
                      <button onClick={() => tasks.refetch()}>重试</button>
                    </div>
                  ) : group ? (
                    stages
                      .filter(([id]) => stage === "all" || stage === id)
                      .map(([id, name]) => {
                        const items = roots.filter(
                          (t) =>
                            t.stage === id &&
                            (visible(t) || children(t.id).some(visible)),
                        );
                        const orphanChildren = all.filter(
                          (t) =>
                            t.parent_id &&
                            t.stage === id &&
                            visible(t) &&
                            !items.some((p) => p.id === t.parent_id) &&
                            roots.find((p) => p.id === t.parent_id)?.stage !==
                              id,
                        );
                        return (
                          <div className="task-group" key={id}>
                            <h3>
                              <span className={"stage-dot " + id} />
                              {name}
                              <span>
                                {items.length + orphanChildren.length}
                              </span>
                            </h3>
                            {items.map(renderRoot)}
                            {orphanChildren.map((t) => (
                              <div key={t.id}>
                                <small className="parent-hint">
                                  ↳{" "}
                                  {all.find((p) => p.id === t.parent_id)?.title}
                                </small>
                                {row(t, true)}
                              </div>
                            ))}
                            {!items.length && !orphanChildren.length && (
                              <div className="empty-group">暂无任务</div>
                            )}
                          </div>
                        );
                      })
                  ) : (
                    roots
                      .filter((t) => visible(t) || children(t.id).some(visible))
                      .map(renderRoot)
                  )}

                </section>}
                {taskId && (
                  <div className="task-summary-page">
                    {detail.isPending ? (
                      <p>加载任务…</p>
                    ) : detail.isError && !detail.data ? (
                      <p role="alert">
                        任务加载失败
                        <button onClick={() => detail.refetch()}>重试</button>
                      </p>
                    ) : detail.data && detail.data.project_id === projectId ? (
                      <TaskSummary task={detail.data} archived={readOnly} onCreate={openCreate}>
                        <TaskEditor
                          key={taskId + ":" + editorEpoch}
                          task={detail.data}
                          parent={all.find(t => t.id === detail.data?.parent_id)}
                          archived={readOnly}
                          onSave={saveTask}
                          onReload={async () => {
                            await detail.refetch({ throwOnError: true });
                            setEditorEpoch((n) => n + 1);
                          }}
                        />
                        <Relations
                          projectId={projectId}
                          type="tasks"
                          id={taskId}
                          archived={readOnly}
                        />
                      </TaskSummary>
                    ) : (
                      <p>任务不属于此项目</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
      {createOpen && !readOnly && <dialog ref={createDialog} className="create-task-dialog" aria-label="添加任务" onCancel={e => { e.preventDefault(); closeCreate(); }}>
                    <form
                      className="create-task-form"
                      data-dirty={!!newTitle.trim() || !!newParent || creating}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setCreating(true);
                        setError("");
                        try {
                          const t = await api<Task>(
                            "/projects/" + projectId + "/tasks",
                            "POST",
                            { title: newTitle, parent_id: newParent || null },
                          );
                          flushSync(() => {
                            setNewTitle("");
                            setNewParent("");
                            setCreating(false);
                            setCreateOpen(false);
                          });
                          if (t.parent_id)
                            setExpanded((old) =>
                              new Set(old).add(t.parent_id!),
                            );
                          await qc.invalidateQueries({
                            queryKey: ["tasks", projectId],
                          });
                          nav("/projects/" + projectId + "/tasks/" + t.id);
                        } catch (err) {
                          setError((err as Error).message);
                        } finally {
                          setCreating(false);
                        }
                      }}
                    >
                      <h2>添加任务</h2>
                      {error && <p role="alert" className="error">{error}</p>}
                      <label>任务标题<input
                        disabled={creating}
                        aria-label="新任务标题"
                        placeholder="＋ 添加一个新任务…"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        required
                        autoFocus
                      /></label>
                      <label>父任务<select
                        disabled={creating}
                        aria-label="父任务"
                        value={newParent}
                        onChange={(e) => setNewParent(e.target.value)}
                      >
                        <option value="">顶层任务</option>
                        {roots.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title} 的子任务
                          </option>
                        ))}
                      </select></label>
                      <div className="create-task-actions"><button type="button" onClick={closeCreate} disabled={creating}>取消</button><button className="primary" disabled={creating || !newTitle.trim()}>
                        {creating ? "添加中…" : "创建任务"}
                      </button></div>
                    </form>
      </dialog>}
      {projectForm && (
        <ProjectForm
          project={projectForm === "edit" ? p : undefined}
          onClose={() => setProjectForm(null)}
          onSubmit={async (title, description, version) => {
            const next = await api<Project>(
              projectForm === "new" ? "/projects" : "/projects/" + projectId,
              projectForm === "new" ? "POST" : "PATCH",
              {
                title,
                description,
                ...(projectForm === "edit" ? { version } : {}),
              },
            );
            setProjectForm(null);
            setArchived(false);
            await invalidate();
            nav("/projects/" + next.id);
          }}
        />
      )}
    </div>
  );
}
