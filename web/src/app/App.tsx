import { useState, useEffect } from "react";
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
import { TaskEditor, type TaskDraft } from "../features/task/TaskEditor";
import "./styles.css";
import { Events } from "../features/event/Events";
import { Relations } from "../features/relation/Relations";
import { Pages } from "../features/page/Pages";
export function App() {
  const { projectId, taskId, pageId, eventId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [projectForm, setProjectForm] = useState<"new" | "edit" | null>(null);
  const [stage, setStage] = useState("all");
  const [priority, setPriority] = useState("all");
  const [group, setGroup] = useState(true);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newParent, setNewParent] = useState("");
  const [creating, setCreating] = useState(false);
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
  const notes = path.includes("/pages");
  const calendar = path.includes("/events");
  const p = current.data;
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
  const count = all.filter(
    (t) => t.stage !== "done" && t.stage !== "cancelled",
  ).length;
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
            Noteapp<small>为想法留出位置</small>
          </span>
        </Link>
        <div className="sidebar-label">你的工作空间</div>
        <button
          className={"nav-item " + (!archived ? "active" : "")}
          onClick={() => setArchived(false)}
        >
          ◈ 活跃项目
        </button>
        <button
          className={"nav-item " + (archived ? "active" : "")}
          onClick={() => setArchived(true)}
        >
          ▣ 归档项目
        </button>
        <div className="sidebar-heading">
          <span>PROJECTS / {projects.data?.length ?? 0}</span>
          <button aria-label="新建项目" onClick={() => setProjectForm("new")}>
            ＋
          </button>
        </div>
        <nav>
          {projects.data?.map((project) => (
            <Link
              key={project.id}
              className={
                "project-link " + (project.id === projectId ? "active" : "")
              }
              to={"/projects/" + project.id}
            >
              <span className="project-icon">{project.title.slice(0, 1)}</span>
              {project.title}
            </Link>
          ))}
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
          <span className="local-dot" /> 本地空间 · 阶段 3<br />
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>
            工作空间 <span className="slash">/</span>{" "}
            {p?.title ?? "开始一个项目"}
          </span>
          <span className="private-tag">LOCAL & PRIVATE</span>
        </div>
        {!projectId ? (
          <div className="welcome">
            <span className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</span>
            <h1>
              从一个项目，
              <br />
              开始你的下一步。
            </h1>
            <p>
              整理想法，拆解行动。
              <br />
              让每一次推进，都有清晰的落点。
            </p>
            <button className="primary" onClick={() => setProjectForm("new")}>
              ＋ 创建第一个项目
            </button>
          </div>
        ) : current.isPending ? (
          <p className="loading">正在打开项目…</p>
        ) : current.isError && !current.data ? (
          <div className="error" role="alert">
            项目加载失败<button onClick={() => current.refetch()}>重试</button>
          </div>
        ) : (
          <>
            <header className="project-header">
              <div className="eyebrow">PROJECT / 工作项目</div>
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
                {p?.description || "给这个项目一些空间，让想法逐步成为行动。"}
              </p>
              <div className="project-tabs">
                <Link to={"/projects/" + projectId}>
                  任务 <b>{all.length}</b>
                </Link>{" "}
                <Link to={"/projects/" + projectId + "/pages"}>页面</Link>
                <Link to={"/projects/" + projectId + "/events"}>日历</Link>
                <small>{count} 项待推进</small>
              </div>
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
            {calendar ? (
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
              <div className={"workspace " + (taskId ? "with-detail" : "")}>
                <section className="task-list">
                  <div className="list-toolbar">
                    <div>
                      <h2>所有任务</h2>
                      <span>{all.length} 个任务，专注当下的一步</span>
                    </div>
                    <button onClick={() => setGroup(!group)}>
                      {group ? "取消分组" : "按阶段分组"}
                    </button>
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
                  {!readOnly && (
                    <form
                      className="new-task"
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
                          setNewTitle("");
                          setNewParent("");
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
                      <input
                        aria-label="新任务标题"
                        placeholder="＋ 添加一个新任务…"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        required
                      />
                      <select
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
                      </select>
                      <button disabled={creating || !newTitle.trim()}>
                        {creating ? "添加中…" : "添加任务"}
                      </button>
                    </form>
                  )}
                </section>
                {taskId && (
                  <aside className="detail-pane">
                    <button
                      className="close-detail"
                      aria-label="关闭详情"
                      onClick={() => nav("/projects/" + projectId)}
                    >
                      ×
                    </button>
                    {detail.isPending ? (
                      <p>加载任务…</p>
                    ) : detail.isError && !detail.data ? (
                      <p role="alert">
                        任务加载失败
                        <button onClick={() => detail.refetch()}>重试</button>
                      </p>
                    ) : detail.data && detail.data.project_id === projectId ? (
                      <>
                        <TaskEditor
                          key={taskId + ":" + editorEpoch}
                          task={detail.data}
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
                      </>
                    ) : (
                      <p>任务不属于此项目</p>
                    )}
                  </aside>
                )}
              </div>
            )}
          </>
        )}
      </main>
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
