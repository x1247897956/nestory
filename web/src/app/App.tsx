import { useProjectPreferences } from "../features/view/preferences";
import { sortObjects,taskSortFields } from "../features/view/sorting";
import { SortControl } from "../features/view/SortControl";
import { defaultTaskDisplay,normalizeTaskDisplay } from "../features/task/taskDisplay";
import { TaskDisplaySettings } from "../features/task/TaskDisplaySettings";
import { TaskFilters } from "../features/task/TaskFilters";
import { useTaskFilters } from "../features/task/useTaskFilters";
import { TaskBoard } from "../features/task/TaskBoard";
import { TaskViewSwitcher, useProjectTaskView } from "../features/task/TaskViews";
import { ObjectDialog, useOverviewBackground } from "../components/object/ObjectDialog";
import { ProjectMenu } from "../features/project/ProjectMenu";
import { flushSync } from "react-dom";
import { Workspace } from "../features/workspace/Workspace";
import { Search } from "../features/search/Search";
import { Trash } from "../features/trash/Trash";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useBlocker,
  useLocation,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, abandonCreateIntent, stages, priorities, type Project, type Task } from "./api";
import { ProjectForm } from "../features/project/ProjectForm";
import { ProjectOverview } from "../features/project/ProjectOverview";
import { TaskSummary } from "../features/task/TaskSummary";
import { TaskEditor, type TaskDraft } from "../features/task/TaskEditor";
import "./styles.css";
import "./workspace.css";
import "../components/object/property-layout.css";
import "./context-header.css";
import "./project-surfaces.css";
import "./menus.css";
import { Events } from "../features/event/Events";
import { Pages } from "../features/page/Pages";
export function App() {
  const { projectId, taskId, pageId, eventId } = useParams();
  const nav = useNavigate();
  const [taskView,setTaskView]=useProjectTaskView(projectId);
  const qc = useQueryClient();
  const [archived, setArchived] = useState(false);
  const activeProjectHeading = useRef<HTMLDivElement>(null);
  const projectOptions = useRef<HTMLDetailsElement>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState<"new" | "edit" | null>(null);
  const [taskDisplay,setTaskDisplay] = useProjectPreferences(projectId??"","tasks",defaultTaskDisplay,normalizeTaskDisplay);
  const group=taskDisplay.grouped;
  const toggleStage = (stage:string) => setTaskDisplay(old=>({...old,collapsed:old.collapsed.includes(stage)?old.collapsed.filter(id=>id!==stage):[...old.collapsed,stage]}));
  const draggedTask = useRef<string | null>(null);
  const dropTarget = useRef<HTMLElement | null>(null);
  const clearDropTarget = () => { dropTarget.current?.classList.remove("drop-target"); dropTarget.current = null; };
  const [stageBusy, setStageBusy] = useState(false);
  const stageMutation = useRef(false);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newParent, setNewParent] = useState("");
  const [newStage,setNewStage]=useState("todo");
  const initialNewStage=useRef("todo");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const createDialog = useRef<HTMLDialogElement>(null);
  const createAttempts = useRef<object[]>([]);
  useEffect(() => {
    if (createOpen) createDialog.current?.showModal();
  }, [createOpen]);
  const closeCreate = () => {
    if (creating) return;
    if ((newTitle.trim() || newParent || newStage!==initialNewStage.current) && !confirm("放弃未保存的新任务吗？")) return;
    try { for (const input of createAttempts.current) abandonCreateIntent("/projects/" + projectId + "/tasks", input); }
    catch(e) { setError((e as Error).message); return; }
    createAttempts.current = [];
    setCreateOpen(false); setNewTitle(""); setNewParent(""); setNewStage("todo"); initialNewStage.current="todo";
  };
  const openCreate = (parent = "", stage = "todo") => {
    initialNewStage.current=stage; setNewStage(stage); setNewParent(parent); setCreateOpen(true);
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
  const overviewBackground=useOverviewBackground(projectId);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const menu = projectOptions.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      const menu = projectOptions.current;
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => { if (projectOptions.current) projectOptions.current.open = false; }, [path]);
  useEffect(() => {
    setNewTitle("");
    setNewParent("");
    setNewStage("todo"); initialNewStage.current="todo";
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
  const filterState = useTaskFilters(projectId, all, path.includes("/tasks"));
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
  const changeStage = async (id: string, stage: string) => {
    const key = ["tasks", projectId];
    const task = qc.getQueryData<Task[]>(key)?.find(t => t.id === id);
    if (!task || task.stage === stage || readOnly || stageMutation.current || !stages.some(([value]) => value === stage)) return;
    stageMutation.current = true;
    setStageBusy(true);
    setError("");
    const replaceTask = (next: Task) => {
      qc.setQueryData<Task[]>(key, items => items?.map(item => item.id === id ? next : item));
      qc.setQueryData(["task", id], next);
    };
    const refreshStageDependents = () => { void Promise.all([
      qc.invalidateQueries({queryKey:["relations"]}),
      qc.invalidateQueries({queryKey:["relation-options", projectId]}),
      qc.invalidateQueries({queryKey:["workspace"]}),
    ]); };
    try {
      await qc.cancelQueries({queryKey:key, exact:true});
      // Keep the server version until PATCH acknowledges the optimistic move.
      qc.setQueryData<Task[]>(key, items => items?.map(item => item.id === id ? {...item, stage} : item));
      const next = await api<Task>(`/tasks/${id}`, "PATCH", { version: task.version, stage });
      replaceTask(next);
      refreshStageDependents();
    } catch (e) {
      // A lost response may still mean the write succeeded. Read the authoritative
      // version before allowing another move; never guess a new CAS version.
      try {
        const actual = await api<Task>(`/tasks/${id}`);
        replaceTask(actual);
        refreshStageDependents();
        if (actual.stage !== stage) setError("阶段更新失败，请重试：" + (e as Error).message);
      } catch {
        replaceTask(task);
        setError("阶段更新失败，请重试：" + (e as Error).message);
        void qc.invalidateQueries({queryKey:key, exact:true});
      }
    } finally {
      stageMutation.current = false;
      setStageBusy(false);
    }
  };
  const visible = (t: Task) => filterState.ids.has(t.id);
  const orderedTasks = useMemo(()=>sortObjects(all,taskDisplay.sort),[all,taskDisplay.sort]);
  const taskIndex = useMemo(() => {
    const byId = new Map(all.map(task => [task.id, task]));
    const byParent = new Map<string, Task[]>();
    const roots: Task[] = [];
    for (const task of orderedTasks) {
      if (!task.parent_id) roots.push(task);
      else { const siblings = byParent.get(task.parent_id) ?? []; siblings.push(task); byParent.set(task.parent_id, siblings); }
    }
    return {byId, byParent, roots};
  }, [all,orderedTasks]);
  const roots = taskIndex.roots;
  const children = (id: string) => taskIndex.byParent.get(id) ?? [];
  const groupedChildren = (t: Task) => children(t.id).filter(child => !group || child.stage === t.stage);
  const row = (t: Task, child = false) => (
    <div
      key={t.id}
      className={
        "task-row " +
        (child ? "child " : "") +
        (taskId === t.id ? "selected" : "")
      }
    >
      {group && !readOnly && <button className="task-drag-handle" aria-label={"拖动任务 " + t.title}
        title="拖到另一个阶段" disabled={stageBusy} draggable={!stageBusy}
        onDragStart={event => {
          draggedTask.current = t.id;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-noteapp-task", t.id);
        }}
        onDragEnd={() => { draggedTask.current = null; clearDropTarget(); }}>
        <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true" fill="currentColor">{[5,9,13].map(y=><g key={y}><circle cx="5" cy={y} r="1"/><circle cx="9" cy={y} r="1"/></g>)}</svg>
      </button>}
      <label className="task-stage-control" title="更改阶段">
        <span className={"stage-dot " + t.stage} />
        <select aria-label={"更改阶段 " + t.title} value={t.stage} disabled={readOnly || stageBusy}
          onChange={event => void changeStage(t.id, event.target.value)}>
          {stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button className="task-title" onClick={() => openTask(t)}>
        {t.title}
      </button>
      {t.due_date && <time>{t.due_date}</time>}
      {t.priority !== "none" && (
        <span className={"priority " + t.priority}>
          {priorities.find(([id]) => id === t.priority)?.[1]}
        </span>
      )}
      {!child && groupedChildren(t).length > 0 && (
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
          {expanded.has(t.id) ? "−" : "+"} {groupedChildren(t).length}
        </button>
      )}
    </div>
  );
  const renderRoot = (t: Task) => (
    <div key={t.id}>
      {row(t)}
      {(expanded.has(t.id) || filterState.filters.length > 0) &&
        groupedChildren(t)
          .filter(visible)
          .map((c) => row(c, true))}
    </div>
  );
  return (
    <div className="shell">
      <aside className="sidebar" aria-hidden={taskId||pageId||eventId?true:undefined} inert={!!(taskId||pageId||eventId)}>
        <Link to="/" className="brand">
          <span className="brand-mark">n.</span>
          <span>
            Noteapp
          </span>
        </Link>
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
            <details ref={projectOptions} className="project-options">
              <summary aria-label="项目选项">⋯</summary>
              <div><button onClick={event => { setArchived(!archived); event.currentTarget.closest("details")!.open = false; }}>{archived ? "返回项目列表" : "查看已归档项目"}</button></div>
            </details>
            <button aria-label="新建项目" onClick={() => setProjectForm("new")}>＋</button>
          </div>
        </div>
        <nav aria-label="项目列表">
          {navigationProjects.map(project => <div className="sidebar-project" key={project.id}>
            <div className="sidebar-project-row" ref={project.id === projectId ? activeProjectHeading : undefined}>
              <Link className={"project-link " + (project.id === projectId ? "active" : "")} to={"/projects/" + project.id}>
                <span>{project.title}</span>
              </Link>
              <ProjectMenu project={project} onRename={() => { setEditingProject(project); setProjectForm("edit"); }}/>
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

      </aside>
      <main>
        <div aria-hidden={taskId||pageId||eventId?true:undefined} inert={!!(taskId||pageId||eventId)} className={"topbar" + (projectId && (overview || overviewBackground) ? " project-overview-topbar" : "")}>
          <div className="topbar-identity">
          <nav className="breadcrumbs" aria-label="面包屑">
            {projectId ? <>
              {(overview || overviewBackground) ? <h1 aria-label={p?.title ?? "项目"}><Link className="project-breadcrumb" to={"/projects/" + projectId} aria-label="汇总" aria-current="page">{p?.title ?? "项目"}</Link></h1> : <Link className="project-breadcrumb" to={"/projects/" + projectId} aria-label="汇总">{p?.title ?? "项目"}</Link>}
              {!overview && !overviewBackground && <><span className="slash" aria-hidden="true">/</span><span aria-current="page">{notes ? "笔记" : calendar ? "日程" : "任务"}</span></>}

            </> : <span aria-current="page">{path === "/search" ? "搜索" : path === "/trash" ? "回收站" : "工作台"}</span>}
          </nav>
          {projectId && (overview || overviewBackground) && p?.description && <p className="overview-description">{p.description}</p>}
          </div>

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
            {(overview || overviewBackground) && <div aria-hidden={overviewBackground?true:undefined} inert={overviewBackground} className="overview-background">
              <ProjectOverview projectId={projectId} tasks={all} loadingTasks={tasks.isPending} tasksError={tasks.isError} retryTasks={() => void tasks.refetch()} archived={readOnly} onCreateTask={() => openCreate()} />
            </div>}
            {overview ? null : calendar ? (
              <Events
                projectId={projectId}
                projectTitle={p?.title ?? "项目"}
                eventId={eventId}
                archived={readOnly}
              />
            ) : notes ? (
              <Pages
                projectId={projectId}
                projectTitle={p?.title ?? "项目"}
                pageId={pageId}
                archived={readOnly}
              />
            ) : (
              <div className="workspace task-views-workspace">
                {!overviewBackground && <section className="task-list" aria-hidden={taskId?true:undefined} inert={!!taskId}>
                  <div className="list-toolbar">
                    <div>
                      <h2>所有任务</h2>
                      <span aria-live="polite">{stageBusy ? "正在更新阶段…" : `${all.length} 个任务，专注当下的一步`}</span>
                    </div>
                    <div className="task-toolbar-actions"><TaskViewSwitcher view={taskView} onChange={setTaskView}/><SortControl value={taskDisplay.sort} onChange={sort=>setTaskDisplay(old=>({...old,sort}))} fields={taskSortFields} label="任务排序"/>{taskView==="list"&&<TaskDisplaySettings value={taskDisplay} onChange={setTaskDisplay}/>}{!readOnly && <button className="primary" onClick={() => openCreate()}>添加任务</button>}</div>
                  </div>
                  <TaskFilters key={projectId} state={filterState}/>
                  {filterState.filters.length>0&&!filterState.blocked&&<p className="task-filter-message">{filterState.ids.size} / {all.length} 个任务符合条件</p>}
                  {!filterState.blocked&&filterState.filters.length>0&&filterState.ids.size===0&&<div className="task-filter-empty"><p>没有符合条件的任务</p><button onClick={()=>filterState.setFilters([])}>清除筛选</button></div>}
                  {tasks.isPending ? <p role="status">正在加载任务…</p> : tasks.isError ? (
                    <div role="alert">
                      任务加载失败
                      <button onClick={() => tasks.refetch()}>重试</button>
                    </div>
                  ) : (filterState.blocked || (filterState.filters.length>0&&filterState.ids.size===0)) ? null : taskView==="board" ? <TaskBoard key={projectId} projectId={projectId} tasks={orderedTasks.filter(visible)} allTasks={all} readOnly={readOnly} busy={stageBusy} onOpen={openTask} onStageChange={changeStage} onCreate={stage=>openCreate("",stage)}/> : group ? (
                    stages.map(([id, name]) => {
                        const items = roots.filter(
                          (t) =>
                            t.stage === id &&
                            (visible(t) || children(t.id).some(visible)),
                        );
                        const orphanChildren = orderedTasks.filter(
                          (t) =>
                            t.parent_id &&
                            t.stage === id &&
                            visible(t) &&
                            taskIndex.byId.get(t.parent_id)?.stage !== id,
                        );
                        return (
                          <div className="task-group" key={id}
                            role="region" aria-label={name + "阶段"} data-stage={id}
                            onDragOver={event => {
                              if (!readOnly && !stageMutation.current && draggedTask.current) {
                                event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (dropTarget.current !== event.currentTarget) { clearDropTarget(); dropTarget.current = event.currentTarget; event.currentTarget.classList.add("drop-target"); }
                              }
                            }}
                            onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) clearDropTarget(); }}
                            onDrop={event => {
                              event.preventDefault();
                              const task = draggedTask.current;
                              draggedTask.current = null; clearDropTarget();
                              if (task && event.dataTransfer.getData("application/x-noteapp-task") === task) {
                                if(taskDisplay.collapsed.includes(id))setTaskDisplay(old=>({...old,collapsed:old.collapsed.filter(stage=>stage!==id)}));
                                void changeStage(task, id);
                              }
                            }}>
                            <h3><button type="button" className="task-stage-toggle" aria-label={`${taskDisplay.collapsed.includes(id)?"展开":"收起"}${name}阶段`} aria-expanded={!taskDisplay.collapsed.includes(id)} onClick={()=>toggleStage(id)}>
                              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={taskDisplay.collapsed.includes(id)?"m8 5 5 5-5 5":"m5 8 5 5 5-5"}/></svg>
                              <span className={"stage-dot " + id}/>{name}<span>{items.length+orphanChildren.length}</span>
                            </button></h3>
                            <div className="task-group-content" hidden={taskDisplay.collapsed.includes(id)}>
                            {items.map(renderRoot)}
                            {orphanChildren.map((t) => (
                              <div key={t.id}>
                                <small className="parent-hint">
                                  ↳{" "}
                                  {taskIndex.byId.get(t.parent_id ?? "")?.title}
                                </small>
                                {row(t, true)}
                              </div>
                            ))}
                            {!items.length && !orphanChildren.length && (
                              <div className="empty-group">暂无任务</div>
                            )}
                            </div>
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
                  <ObjectDialog projectId={projectId} projectTitle={p?.title ?? "项目"} type="tasks" title={detail.data?.title ?? "加载中…"}>
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
                          parentOptions={all.filter(t => !t.parent_id && t.id !== taskId)}
                          hasChildren={all.some(t => t.parent_id === taskId)}
                          onParentChange={async (parentId, version) => {
                            const next = await api<Task>("/tasks/" + taskId + "/move", "POST", {parent_id: parentId || null, position: all.filter(t => (t.parent_id ?? "") === parentId && t.id !== taskId).length, version});
                            qc.setQueryData(["task", taskId], next);
                            await invalidate();
                            setEditorEpoch(n => n + 1);
                          }}
                          archived={readOnly}
                          onSave={saveTask}
                          onReload={async (beforeReset) => {
                            await detail.refetch({ throwOnError: true });
                            beforeReset?.();
                            setEditorEpoch((n) => n + 1);
                          }}
                        />
                      </TaskSummary>
                    ) : (
                      <p>任务不属于此项目</p>
                    )}
                  </div>
                  </ObjectDialog>
                )}
              </div>
            )}
          </>
        )}
      </main>
      {createOpen && !readOnly && <dialog ref={createDialog} className="create-task-dialog" aria-label="添加任务" onCancel={e => { e.preventDefault(); closeCreate(); }}>
                    <form
                      className="create-task-form"
                      data-dirty={!!newTitle.trim() || !!newParent || newStage!==initialNewStage.current || creating}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setCreating(true);
                        setError("");
                        try {
                          const input = { title: newTitle, parent_id: newParent || null, ...(newStage!=="todo"?{stage:newStage}:{}) };
                          createAttempts.current.push(input);
                          const t = await api<Task>(
                            "/projects/" + projectId + "/tasks",
                            "POST",
                            input,
                          );
                          for (const attempted of createAttempts.current) abandonCreateIntent("/projects/" + projectId + "/tasks", attempted);
                          createAttempts.current = [];
                          flushSync(() => {
                            setNewTitle("");
                            setNewParent("");
                            setNewStage("todo"); initialNewStage.current="todo";
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
                      <label>阶段<select aria-label="新任务阶段" disabled={creating} value={newStage} onChange={event=>setNewStage(event.target.value)}>{stages.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
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
          project={projectForm === "edit" ? editingProject ?? p : undefined}
          onClose={() => {setProjectForm(null);setEditingProject(null)}}
          onSubmit={async (title, description, version) => {
            const next = await api<Project>(
              projectForm === "new" ? "/projects" : "/projects/" + (editingProject?.id ?? projectId),
              projectForm === "new" ? "POST" : "PATCH",
              {
                title,
                description,
                ...(projectForm === "edit" ? { version } : {}),
              },
            );
            setProjectForm(null);
            setEditingProject(null);
            setArchived(false);
            await invalidate();
            nav("/projects/" + next.id);
          }}
        />
      )}
    </div>
  );
}
