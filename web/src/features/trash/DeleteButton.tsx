import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../app/api";
type Preview = {
  fingerprint: string;
  version: number;
  count: number;
  members?: { id: string; title: string }[];
};
export function DeleteButton({
  disabled = false,
  label = "移入回收站",
  type,
  id,
  projectId,
  icon,
  onOpen,
}: {
  disabled?: boolean;
  label?: string;
  type: string;
  id: string;
  projectId: string;
  icon?: ReactNode;
  onOpen?: () => void;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const descriptionId = useId();
  useEffect(() => {
    if (preview && !dialog.current?.open) dialog.current?.showModal();
  }, [preview]);
  const dismiss = () => {
    if (busy) return;
    dialog.current?.close();
    setPreview(null);
    setError("");
  };
  const url = "/" + type + "/" + id;
  async function load() {
    setBusy(true);
    setError("");
    setRefreshFailed(false);
    try {
      const next = await api<Preview>(url + "/delete-preview");
      onOpen?.();
      setPreview(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="delete-control">
      <button
        disabled={busy || disabled}
        onClick={() => {
          if (document.querySelector('[data-dirty="true"]')) {
            setError("请先保存或放弃未保存更改，再删除。");
            return;
          }
          void load();
        }}
      >
        {icon}{label}
      </button>
      {preview && createPortal(
        <dialog ref={dialog} className="delete-dialog" aria-label="确认删除" aria-describedby={descriptionId}
          onCancel={(event) => { event.preventDefault(); dismiss(); }}>
          <h2>移入回收站？</h2>
          <p id={descriptionId}>
            将删除此对象及后代，共 {preview.count}{" "}
            个对象。关联将保留，可从回收站恢复。
          </p>
          <ul className="delete-members" aria-label="将移入回收站的对象">
            {preview.members?.map((m) => (
              <li key={m.id} title={m.title}>{m.title}</li>
            ))}
          </ul>
          {error && <p role="alert" className="delete-error">{error}</p>}
          <footer>
          <button autoFocus disabled={busy} onClick={dismiss}>取消</button>
          <button className="delete-confirm"
            disabled={busy || refreshFailed}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                if (document.querySelector('[data-dirty="true"]'))
                  throw new Error("请先保存或放弃未保存更改，再删除。");
                await api(url, "DELETE", preview);
                dialog.current?.close();
                setPreview(null);
                nav(
                  type === "projects" ? "/" : "/projects/" +
                    projectId +
                    (type === "tasks" ? "" : "/" + type),
                );
                await qc.invalidateQueries();
              } catch (e) {
                if (e instanceof ApiError && e.status === 409) {
                  try {
                    setPreview(await api<Preview>(url + "/delete-preview"));
                  } catch {
                    setRefreshFailed(true);
                    setError("无法刷新删除预览，请取消后重试。");
                    return;
                  }
                  setError(
                    "内容或数量已变化，请检查新的预览并再次确认。" +
                      (e as Error).message,
                  );
                } else setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "正在移入回收站…" : `确认删除 ${preview.count} 个对象`}
          </button>
          </footer>
        </dialog>, document.body
      )}
      {error && !preview && <p role="alert">{error}</p>}
    </div>
  );
}
