import {useI18n, t as tr, translateError} from "../../i18n";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Project } from "../../app/api";
import { DeleteButton } from "../trash/DeleteButton";

function MenuIcon({ action }: { action: "rename" | "archive" | "pin" | "delete" }) {
  const paths = {
    rename: <><path d="m14 3 3 3-10 10-4 1 1-4Z"/><path d="m12 5 3 3"/></>,
    archive: <><path d="M3 7h14v10H3zM2 3h16v4H2zM7 11h6"/></>,
    pin: <><path d="m7 3 6 0-1 5 3 3v2H5v-2l3-3ZM10 13v5"/></>,
    delete: <><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6"/></>,
  };
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[action]}</svg>;
}

export function ProjectMenu({ project, onRename }: {
  project: Project;
  onRename: () => void;
}) {
  useI18n();
  const qc = useQueryClient();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const change = async (patch: object) => {
    setBusy(true);
    setError("");
    try {
      if ("archived" in patch && !project.archived_at && document.querySelector('[data-dirty="true"]')) throw new Error("请先等待保存和文件处理完成，再归档项目。");
      await api(`/projects/${project.id}`, "PATCH", { version: project.version, ...patch });
      await qc.invalidateQueries();
      panel.current?.hidePopover();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <>
    <button
      ref={trigger}
      className="project-menu-trigger"
      aria-label={tr("项目设置 {title}",{title:project.title})}
      popoverTarget={`project-menu-${project.id}`}
      onClick={() => {
        const box = trigger.current!.getBoundingClientRect();
        if (panel.current) {
          panel.current.style.top = Math.max(8, Math.min(box.bottom + 4, window.innerHeight - 250)) + "px";
          panel.current.style.left = Math.max(8, Math.min(box.left, window.innerWidth - 204)) + "px";
        }
      }}
    >⋯</button>
    <div ref={panel} id={`project-menu-${project.id}`} popover="auto" className="project-row-menu" aria-label={tr("{title}设置",{title:project.title})}>
      <button disabled={busy || !!project.archived_at} onClick={() => { panel.current?.hidePopover(); onRename(); }}><MenuIcon action="rename"/>{tr("重命名")}</button>
      <button disabled={busy} onClick={() => void change({ archived: !project.archived_at })}><MenuIcon action="archive"/>{project.archived_at ? tr("取消归档") : tr("归档")}</button>
      <button disabled={busy || !!project.archived_at} onClick={() => void change({ pinned: !project.pinned })}><MenuIcon action="pin"/>{project.pinned ? tr("取消置顶") : tr("置顶")}</button>
      <DeleteButton type="projects" id={project.id} projectId={project.id} label={tr("删除")} icon={<MenuIcon action="delete"/>} disabled={busy || !!project.archived_at}
        onOpen={() => { panel.current?.hidePopover(); trigger.current?.focus(); }}/>
      {error && <p role="alert">{translateError(error)}</p>}
    </div>
  </>;
}
