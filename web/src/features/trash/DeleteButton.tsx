import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../app/api";
type Preview = {
  version: number;
  count: number;
  members?: { id: string; title: string }[];
};
export function DeleteButton({
  type,
  id,
  projectId,
}: {
  type: string;
  id: string;
  projectId: string;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = "/" + type + "/" + id;
  async function load() {
    setBusy(true);
    setError("");
    try {
      setPreview(await api<Preview>(url + "/delete-preview"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="delete-control">
      <button
        disabled={busy}
        onClick={() => {
          if (document.querySelector('[data-dirty="true"]')) {
            setError("请先保存或放弃未保存更改，再删除。");
            return;
          }
          void load();
        }}
      >
        移入回收站
      </button>
      {preview && (
        <div role="dialog" aria-label="确认删除">
          <p>
            将删除此对象及后代，共 {preview.count}{" "}
            个对象。关联将保留，可从回收站恢复。
          </p>
          <ul>
            {preview.members?.map((m) => (
              <li key={m.id}>{m.title}</li>
            ))}
          </ul>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                if (document.querySelector('[data-dirty="true"]'))
                  throw new Error("请先保存或放弃未保存更改，再删除。");
                await api(url, "DELETE", preview);
                setPreview(null);
                nav(
                  "/projects/" +
                    projectId +
                    (type === "tasks" ? "" : "/" + type),
                );
                await qc.invalidateQueries();
              } catch (e) {
                if (e instanceof ApiError && e.status === 409) {
                  try {
                    setPreview(await api<Preview>(url + "/delete-preview"));
                  } catch {
                    setPreview(null);
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
            确认删除 {preview.count} 个对象
          </button>
          <button disabled={busy} onClick={() => setPreview(null)}>
            取消
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
