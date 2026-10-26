import { useRef, useMemo, type DragEvent } from 'react';
import { type Task, stages, priorities } from '../../app/api';
import './task-board.css';

type TaskBoardProps = {
  projectId: string;
  tasks: Task[];
  allTasks: Task[];
  readOnly: boolean;
  busy: boolean;
  onOpen: (task: Task) => void;
  onStageChange: (id: string, stage: string) => Promise<void>;
  onCreate: (stage: string) => void;
};

const dragType = 'application/x-noteapp-task';
const knownStage = (stage: string) => stages.some(([value]) => value === stage);

export function TaskBoard({ projectId, tasks, allTasks, readOnly, busy, onOpen, onStageChange, onCreate }: TaskBoardProps) {
  const dragging = useRef<{ id: string; projectId: string } | null>(null);
  const overTarget = useRef<HTMLElement | null>(null);
  const clearOver = () => { overTarget.current?.classList.remove('is-drag-over'); overTarget.current = null; };
  const parents = useMemo(() => new Map(allTasks.map(task => [task.id, task])), [allTasks]);
  const visibleIds = useMemo(() => new Set(tasks.filter(task => task.project_id === projectId).map(task => task.id)), [tasks, projectId]);
  const disabled = readOnly || busy;
  const changeStage = (task: Task, stage: string) => {
    if (disabled || task.project_id !== projectId || stage === task.stage || !knownStage(stage)) return;
    // The shared mutation owns error presentation and server reconciliation.
    void onStageChange(task.id, stage).catch(() => {});
  };
  const canDrop = () => !disabled && dragging.current?.projectId === projectId &&
    visibleIds.has(dragging.current?.id ?? "");
  const drop = (event: DragEvent<HTMLElement>, stage: string) => {
    event.preventDefault();
    clearOver();
    if (!canDrop()) return;
    const ownDrag = dragging.current;
    dragging.current = null;
    try {
      const payload = JSON.parse(event.dataTransfer.getData(dragType)) as { id?: string; projectId?: string };
      if (!ownDrag || payload.id !== ownDrag.id || payload.projectId !== projectId) return;
      const task = tasks.find(item => item.id === ownDrag.id && item.project_id === projectId);
      if (task) changeStage(task, stage);
    } catch { /* Ignore external or malformed drag data. */ }
  };

  return <section className="task-board" role="region" aria-label="任务看板" tabIndex={0}>
    <div className="task-board-track">
      {stages.map(([stage, label]) => {
        const columnTasks = tasks.filter(task => task.stage === stage || (stage === 'todo' && !knownStage(task.stage)));
        return <section key={stage} className="task-board-column"
          role="region" aria-label={`${label}看板列`} data-stage={stage}
          onDragOver={event => {
            if (!canDrop()) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            if (overTarget.current !== event.currentTarget) { clearOver(); overTarget.current = event.currentTarget; event.currentTarget.classList.add('is-drag-over'); }
          }}
          onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearOver();
          }}
          onDrop={event => drop(event, stage)}>
          <header className="task-board-column-header">
            <h3>{label}<span className="task-board-count">{columnTasks.length}</span></h3>
            {!readOnly && <button type="button" className="task-board-create" aria-label={`在${label}新增任务`}
              disabled={busy} onClick={() => onCreate(stage)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>}
          </header>
          <div className="task-board-cards">
            {columnTasks.length === 0 && <p className="task-board-empty">暂无任务</p>}
            {columnTasks.map(task => {
              const parent = task.parent_id ? parents.get(task.parent_id) : undefined;
              const priority = priorities.find(([value]) => value === task.priority)?.[1] ?? task.priority;
              return <article className="task-board-card" key={task.id} data-task-id={task.id} draggable={!disabled}
                onDragStart={event => {
                  if (disabled || task.project_id !== projectId) { event.preventDefault(); return; }
                  dragging.current = { id: task.id, projectId };
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData(dragType, JSON.stringify(dragging.current));
                }}
                onDragEnd={() => { dragging.current = null; clearOver(); }}>
                <button type="button" className="task-board-open" aria-label={`打开任务 ${task.title}`} onClick={() => onOpen(task)}>
                  {task.parent_id && <span className="task-board-parent">父任务 · {parent?.title ?? '未找到父任务'}</span>}
                  <span className="task-board-title">{task.title}</span>
                  <span className="task-board-meta"><span>优先级 · {priority}</span>{task.due_date && <time dateTime={task.due_date}>截止 {task.due_date}</time>}</span>
                </button>
                <div className="task-board-stage-control">
                  <select aria-label={`更改看板阶段 ${task.title}`} value={knownStage(task.stage) ? task.stage : 'todo'}
                    disabled={disabled} onChange={event => changeStage(task, event.target.value)}>
                    {stages.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                  </select>
                </div>
              </article>;
            })}
          </div>
        </section>;
      })}
    </div>
  </section>;
}
