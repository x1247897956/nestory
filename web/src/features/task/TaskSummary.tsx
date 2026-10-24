import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Task } from '../../app/api';

export function TaskSummary({ task, archived, onCreate, children }: {
  task: Task; archived: boolean; onCreate: (parent?: string) => void; children: ReactNode;
}) {
  return <section className="task-summary" aria-label="任务汇总">
    <div className="summary-navigation">
      <Link to={`/projects/${task.project_id}/tasks`}>← 返回任务列表</Link>
      {!archived && <button className="primary" onClick={() => onCreate()}>添加任务</button>}
    </div>
    <div className="summary-editor">{children}</div>
  </section>;
}
