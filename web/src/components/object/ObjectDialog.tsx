import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "./object-dialog.css";

const ObjectPortalContext = createContext<HTMLElement | undefined>(undefined);
export const useObjectPortal = () => useContext(ObjectPortalContext);
// Navigation origin is scoped to this project and survives history/reload.
export function useOverviewBackground(projectId?:string) {
  const location=useLocation();
  return !!projectId && location.state?.overviewProject===projectId && /^\/projects\/[^/]+\/(tasks|pages|events)\/[^/]+$/.test(location.pathname);
}
const labels = { tasks: "任务", pages: "笔记", events: "日程" };

export function ObjectDialog({ projectId, projectTitle, type, title, children }: {
  projectId: string; projectTitle: string; type: keyof typeof labels; title: string; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const nav = useNavigate();
  const fromOverview=useOverviewBackground(projectId);
  const close = () => nav(fromOverview?`/projects/${projectId}`:`/projects/${projectId}/${type}`);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const previous = document.activeElement;
    node.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={dialog} className="object-dialog" aria-label={`${labels[type]}详情`} onCancel={event => {
    event.preventDefault();
    close();
  }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  }}>
    <header className="object-dialog-header">
      <nav aria-label="面包屑">
        <Link aria-label="汇总" to={`/projects/${projectId}`}>{projectTitle}</Link><span aria-hidden="true">/</span>
        <Link to={`/projects/${projectId}/${type}`}>{labels[type]}</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{title}</span>
      </nav>
      <button type="button" className="object-dialog-close" aria-label={`关闭${labels[type]}详情`} onClick={close} autoFocus>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
      </button>
    </header>
    <div className="object-dialog-body"><ObjectPortalContext.Provider value={portal ?? undefined}>{children}</ObjectPortalContext.Provider></div>
    <div ref={setPortal} className="object-dialog-portals" />
  </dialog>;
}
