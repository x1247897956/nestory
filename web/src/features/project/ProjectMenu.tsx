import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Project } from "../../app/api";
import { DeleteButton } from "../trash/DeleteButton";

export function ProjectMenu({ project, onRename }: {
  project: Project;
  onRename: () => void;
}) {
  const qc = useQueryClient();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const change = async (patch: object) => {
    setBusy(true);
    setError("");
    try {
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
      aria-label={`项目设置 ${project.title}`}
      popoverTarget={`project-menu-${project.id}`}
      onClick={() => {
        const box = trigger.current!.getBoundingClientRect();
        if (panel.current) {
          panel.current.style.top = Math.max(8, Math.min(box.bottom + 4, window.innerHeight - 250)) + "px";
          panel.current.style.left = Math.max(8, Math.min(box.left, window.innerWidth - 190)) + "px";
        }
      }}
    >⋯</button>
    <div ref={panel} id={`project-menu-${project.id}`} popover="auto" className="project-row-menu" aria-label={`${project.title}设置`}>
      <button disabled={busy || !!project.archived_at} onClick={() => { panel.current?.hidePopover(); onRename(); }}>重命名</button>
      <button disabled={busy} onClick={() => void change({ archived: !project.archived_at })}>{project.archived_at ? "取消归档" : "归档"}</button>
      <button disabled={busy || !!project.archived_at} onClick={() => void change({ pinned: !project.pinned })}>{project.pinned ? "取消置顶" : "置顶（Pin）"}</button>
      <DeleteButton type="projects" id={project.id} projectId={project.id} label="删除" disabled={!!project.archived_at}/>
      {error && <p role="alert">{error}</p>}
    </div>
  </>;
}
