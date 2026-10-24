import { liveMarkdown } from "./liveMarkdown";
import { useState, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { MarkdownPreview } from "./MarkdownPreview";
import "./markdown.css";
export function MarkdownEditor({
  value,
  onChange,
  disabled = false,
  projectId,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  projectId?: string;
}) {
  const latest = useRef(value);
  latest.current = value;
  const [mode, setMode] = useState("live");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  return (
    <div className="markdown-editor">
      <div className="markdown-toolbar">
        {[
          ["live", "即时"],
          ["source", "源码"],
          ["preview", "预览"],
          ["split", "分屏"],
        ].map(([id, name]) => (
          <button
            type="button"
            key={id}
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
          >
            {name}
          </button>
        ))}
        {projectId && !disabled && (
          <label className="attachment-button">
            ＋ 附件
            <input
              aria-label="上传附件"
              type="file"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError("");
                setUploading(true);
                try {
                  const form = new FormData();
                  form.append("file", file);
                  const res = await fetch(
                    "/api/v1/projects/" + projectId + "/assets",
                    { method: "POST", body: form },
                  );
                  const a = await res.json();
                  if (!res.ok) throw Error(a.error?.message || "上传失败");
                  const image = [
                    "image/png",
                    "image/jpeg",
                    "image/gif",
                    "image/webp",
                  ].includes(a.media_type);
                  onChange(
                    latest.current +
                      "\n" +
                      (image ? "!" : "") +
                      "[" +
                      file.name.replace(/[\[\]\\]/g, "_") +
                      "](" +
                      a.url +
                      ")\n",
                  );
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setUploading(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
        )}
      </div>
      {uploading && <p role="status">上传中…</p>}
      {error && <p role="alert">上传失败：{error}</p>}
      <div className={"markdown-panels " + mode}>
        {mode !== "preview" && (
          <CodeMirror
            value={value}
            onChange={onChange}
            extensions={[
              markdown(),
              ...(mode === "live" ? [liveMarkdown] : []),
              EditorView.contentAttributes.of({
                "aria-label": "Markdown 正文",
              }),
            ]}
            editable={!disabled}
            basicSetup={{ lineNumbers: mode !== "live", foldGutter: mode !== "live" }}
          />
        )}
        {(mode === "preview" || mode === "split") && (
          <MarkdownPreview
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
