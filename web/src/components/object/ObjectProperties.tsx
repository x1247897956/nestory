import type { ReactNode } from "react";
import { Relations } from "../../features/relation/Relations";
import { DeleteButton } from "../../features/trash/DeleteButton";

export function ObjectProperties({ projectId, type, id, archived, children }: {
  projectId: string; type: "tasks" | "pages" | "events"; id: string; archived: boolean; children?: ReactNode;
}) {
  return <div className="object-properties task-properties" role="group" aria-label="对象属性">
    {children}
    <Relations key={type + id} projectId={projectId} type={type} id={id} archived={archived}/>
    {!archived && <div className="object-actions"><DeleteButton type={type} id={id} projectId={projectId}/></div>}
  </div>;
}
