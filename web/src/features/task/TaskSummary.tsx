import {useI18n, t as tr} from "../../i18n";
import type { ReactNode } from 'react';
import type { Task } from '../../app/api';

export function TaskSummary({ children }: {
  task: Task; archived: boolean; onCreate: (parent?: string) => void; children: ReactNode;
}) {
  useI18n();
  return <section className="task-summary" aria-label={tr("任务汇总")}>
    <div className="summary-editor">{children}</div>
  </section>;
}
