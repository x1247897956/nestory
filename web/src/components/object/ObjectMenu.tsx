import {useI18n} from "../../i18n";
import { useId, useRef } from "react";
import { DeleteButton } from "../../features/trash/DeleteButton";

export function ObjectMenu({ type, id, projectId, archived }: {
  type: "tasks" | "pages" | "events"; id: string; projectId: string; archived: boolean;
}) {
  const {t}=useI18n();
  const menuId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  if (archived) return null;
  return <div className="object-menu">
    <button ref={trigger} className="object-menu-trigger" aria-label={t("对象菜单")} title={t("更多操作")} popoverTarget={menuId}
      onClick={() => {
        const box = trigger.current!.getBoundingClientRect();
        if (panel.current) {
          panel.current.style.left = Math.max(8, Math.min(box.right - 196, window.innerWidth - 204)) + "px";
          panel.current.style.top = Math.max(8, Math.min(box.bottom + 6, window.innerHeight - 100)) + "px";
        }
      }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="16" cy="10" r="1.4"/></svg>
    </button>
    <div ref={panel} id={menuId} popover="auto" role="group" aria-label={t("对象操作")} className="project-row-menu object-action-menu">
      <DeleteButton type={type} id={id} projectId={projectId}
        icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6"/></svg>}
        onOpen={() => { panel.current?.hidePopover(); trigger.current?.focus(); }}/>
    </div>
  </div>;
}
