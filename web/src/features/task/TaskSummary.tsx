import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { stages, priorities, type Task } from '../../app/api';

export function TaskSummary({ task, tasks, archived, onCreate, children }: {
  task: Task; tasks: Task[]; archived: boolean; onCreate: (parent?: string) => void; children: ReactNode;
}) {
  const subtasks = tasks.filter(t => t.parent_id === task.id);
  const parent = tasks.find(t => t.id === task.parent_id);
  const finished = subtasks.filter(t => t.stage === 'done' || t.stage === 'cancelled').length;
  const url = `/projects/${task.project_id}`;
  return <section className="task-summary" aria-label="任务汇总">
    <div className="summary-navigation">
      <Link to={`${url}/tasks`}>← 返回任务列表</Link>
      {!archived && <button className="primary" onClick={() => onCreate()}>添加任务</button>}
    </div>
    <header className="summary-heading">
      <div className="eyebrow">TASK / {task.parent_id ? '子任务汇总' : '任务汇总'}</div>
      <h2>{task.title}</h2>
      {parent && <p className="summary-parent">所属任务 · <Link to={`${url}/tasks/${parent.id}`}>{parent.title}</Link></p>}
      <div className="summary-facts">
        <span><i className={'stage-dot '+task.stage}/>{stages.find(([id]) => id === task.stage)?.[1]}</span>
        <span>优先级 · {priorities.find(([id]) => id === task.priority)?.[1]}</span>
        <span>截止 · {task.due_date ?? '未设置'}</span>
      </div>
    </header>
    <div className="summary-content">
      <div className="summary-editor">{children}</div>
      <aside className="summary-subtasks" aria-label="子任务汇总">
        <div className="list-toolbar"><h3>{task.parent_id ? '任务层级' : '子任务'}</h3>
          {!archived && !task.parent_id && <button onClick={() => onCreate(task.id)}>添加子任务</button>}
        </div>
        {task.parent_id ? <p className="muted">当前是子任务。可从上方所属任务查看整体进度。</p> : <>
          <div className="summary-progress"><strong>{finished} / {subtasks.length}</strong><span>已结束</span></div>
          <progress max={subtasks.length || 1} value={finished} aria-label="子任务完成进度"/>
          <p className="muted">父任务与子任务阶段独立更新。</p>
          {subtasks.length ? <ul className="summary-task-links">{subtasks.map(t => <li key={t.id}>
            <Link to={`${url}/tasks/${t.id}`}><i className={'stage-dot '+t.stage}/><span>{t.title}<small>{stages.find(([id]) => id === t.stage)?.[1]}{t.due_date ? ` · ${t.due_date}` : ''}</small></span><span aria-hidden="true">↗</span></Link>
          </li>)}</ul> : <p className="empty-group">暂无子任务</p>}
        </>}
      </aside>
    </div>
  </section>;
}
