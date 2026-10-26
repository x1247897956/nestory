import type { ReactNode } from 'react';
import type { Task } from '../../app/api';

export function TaskSummary({ children }: {
  task: Task; archived: boolean; onCreate: (parent?: string) => void; children: ReactNode;
}) {
  return <section className="task-summary" aria-label="任务汇总">
    <div className="summary-editor">{children}</div>
  </section>;
}
