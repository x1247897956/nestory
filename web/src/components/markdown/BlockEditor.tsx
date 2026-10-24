import { useCallback, useEffect, useRef, useState, useId, memo } from "react";
import {
  BlockNoteEditor,
  filterSuggestionItems,
  type Block,
  type PartialBlock,
} from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { zh } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/ariakit";
import {
  SideMenuController,
  AddBlockButton,
  useBlockNoteEditor,
  useExtensionState,
  useComponentsContext,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import "@blocknote/ariakit/style.css";
import "./markdown.css";

import type { BodyDocument, DocumentFields } from "../../app/document";

type Props = DocumentFields & {
  value: string;
  onChange: (body: string, document?: BodyDocument) => void;
  disabled?: boolean;
  projectId?: string;
};
function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Let BlockNote allocate fresh IDs recursively when duplicating a subtree.
function duplicateContent(block: Block): PartialBlock {
  const { id: _id, children, ...rest } = structuredClone(block);
  return { ...rest, children: children.map(duplicateContent) } as PartialBlock;
}
// Native top-layer menu keeps focus/scroll changes from dismissing block actions.
function ObjectSideMenu() {
  const editor = useBlockNoteEditor();
  const components = useComponentsContext()!;
  const side = editor.getExtension(SideMenuExtension)!;
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  });
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  if (!block) return null;
  const close = () => menu.current?.hidePopover();
  return (
    <components.SideMenu.Root className="bn-side-menu">
      <AddBlockButton />
      <button
        type="button"
        className="block-handle"
        aria-label="打开菜单"
        aria-haspopup="menu"
        aria-controls={id}
        draggable
        onDragStart={(event) => side.blockDragStart(event, block)}
        onDragEnd={side.blockDragEnd}
        onPointerDown={() => side.freezeMenu()}
        onClick={(event) => {
          side.freezeMenu();
          const rect = event.currentTarget.getBoundingClientRect();
          if (menu.current) {
            menu.current.style.left =
              Math.min(rect.right + 8, window.innerWidth - 168) + "px";
            menu.current.style.top =
              Math.min(rect.top, window.innerHeight - 100) + "px";
            menu.current.showPopover();
          }
        }}
      >
        ⠿
      </button>
      <div
        id={id}
        popover="auto"
        ref={menu}
        role="menu"
        className="block-action-menu"
        onToggle={(event) => {
          if (event.newState === "closed") side.unfreezeMenu();
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            editor.insertBlocks(
              [duplicateContent(block as Block)],
              block,
              "after",
            );
            close();
          }}
        >
          复制块
        </button>
        <button
          type="button"
          role="menuitem"
          className="danger"
          onClick={() => {
            editor.removeBlocks([block]);
            close();
          }}
        >
          删除块
        </button>
      </div>
    </components.SideMenu.Root>
  );
}
const EditorCanvas = memo(function EditorCanvas({
  editor,
  disabled,
  emit,
  attachmentInput,
  importInput,
}: {
  editor: BlockNoteEditor;
  disabled: boolean;
  emit: () => void;
  attachmentInput: React.RefObject<HTMLInputElement | null>;
  importInput: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <BlockNoteView
      editor={editor}
      editable={!disabled}
      theme="light"
      onChange={emit}
      slashMenu={false}
      sideMenu={false}
    >
      {!disabled && <SideMenuController sideMenu={ObjectSideMenu} />}
      {!disabled && (
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...getDefaultReactSlashMenuItems(editor),
                {
                  title: "上传附件",
                  subtext: "插入图片或文件",
                  aliases: ["attachment", "upload", "附件"],
                  group: "文件",
                  onItemClick: () => attachmentInput.current?.click(),
                },
                {
                  title: "导入 Markdown",
                  subtext: "在当前光标处插入 .md 文件",
                  aliases: ["import", "markdown"],
                  group: "文件",
                  onItemClick: () => importInput.current?.click(),
                },
                {
                  title: "导出 Markdown",
                  subtext: "下载当前正文的 Markdown 副本",
                  aliases: ["export", "markdown"],
                  group: "文件",
                  onItemClick: () =>
                    download(
                      editor.blocksToMarkdownLossy(editor.document),
                      "正文.md",
                    ),
                },
              ],
              query,
            )
          }
        />
      )}
    </BlockNoteView>
  );
});
export function BlockEditor({
  value,
  body_document,
  legacy_body,
  onChange,
  disabled = false,
  projectId,
}: Props) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const locked = useRef(disabled);
  locked.current = disabled;
  const latest = useRef({
    value,
    document: JSON.stringify(body_document ?? null),
    onChange,
  });
  latest.current.onChange = onChange;
  const importInput = useRef<HTMLInputElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [loaded] = useState(() => {
    try {
      const instance = BlockNoteEditor.create({
        dictionary: {
          ...zh,
          placeholders: {
            ...zh.placeholders,
            default: "输入文字，或按 / 插入内容",
          },
        },
        domAttributes: {
          editor: {
            "aria-label": "Markdown 正文",
            role: "textbox",
            "aria-multiline": "true",
          },
        },
        initialContent: body_document?.blocks.length
          ? body_document.blocks
          : undefined,
        uploadFile: async (file) => {
          if (locked.current || !projectId) throw Error("当前正文不可上传附件");
          setPending((n) => n + 1);
          setError("");
          try {
            const form = new FormData();
            form.append("file", file);
            const response = await fetch(
              `/api/v1/projects/${projectId}/assets`,
              { method: "POST", body: form },
            );
            const asset = await response.json();
            if (!response.ok) throw Error(asset.error?.message || "上传失败");
            return asset.url as string;
          } catch (e) {
            setError(`上传失败：${(e as Error).message}`);
            throw e;
          } finally {
            setPending((n) => n - 1);
          }
        },
      });
      if (!body_document && value)
        instance.replaceBlocks(
          instance.document,
          instance.tryParseMarkdownToBlocks(value),
        );
      return { editor: instance, error: "" };
    } catch (e) {
      return {
        editor: null,
        error: `正文加载失败，原始内容未修改：${(e as Error).message}`,
      };
    }
  });
  const editor = loaded.editor;
  useEffect(() => {
    if (!editor) return;
    const next = JSON.stringify(body_document ?? null);
    if (value === latest.current.value && next === latest.current.document)
      return;
    try {
      editor.replaceBlocks(
        editor.document,
        body_document?.blocks.length
          ? body_document.blocks
          : value
            ? editor.tryParseMarkdownToBlocks(value)
            : [{ type: "paragraph" }],
      );
      latest.current.value = value;
      latest.current.document = next;
    } catch (e) {
      setError(`正文同步失败，草稿已保留：${(e as Error).message}`);
    }
  }, [value, body_document, editor]);
  useEffect(() => {
    if (!pending) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [pending]);
  const emit = useCallback(() => {
    if (!editor || locked.current) return;
    const blocks = structuredClone(editor.document);
    const body = editor.blocksToMarkdownLossy(blocks);
    const doc: BodyDocument = { version: 1, blocks };
    latest.current.value = body;
    latest.current.document = JSON.stringify(doc);
    latest.current.onChange(body, doc);
  }, [editor]);
  if (!editor)
    return (
      <div role="alert">
        {loaded.error}
        <button onClick={() => download(value, "正文原文.md")}>下载原文</button>
      </div>
    );
  return (
    <div className="block-editor" data-dirty={pending > 0}>
      <EditorCanvas
        editor={editor}
        disabled={disabled}
        emit={emit}
        attachmentInput={attachmentInput}
        importInput={importInput}
      />
      <input
        hidden
        ref={importInput}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        aria-label="导入 Markdown"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || locked.current) return;
          setPending((n) => n + 1);
          setError("");
          try {
            const text = await file.text();
            if (locked.current) return;
            const blocks = editor.tryParseMarkdownToBlocks(text);
            if (blocks.length)
              editor.insertBlocks(
                blocks,
                editor.getTextCursorPosition().block,
                "after",
              );
          } catch (err) {
            setError(`导入失败：${(err as Error).message}`);
          } finally {
            setPending((n) => n - 1);
          }
        }}
      />
      {!disabled && projectId && (
        <input
          hidden
          ref={attachmentInput}
          type="file"
          aria-label="上传附件"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || locked.current) return;
            try {
              const url = await editor.uploadFile!(file);
              if (locked.current) return;
              editor.insertBlocks(
                [
                  {
                    type: file.type.match(/^image\/(png|jpeg|gif|webp)$/)
                      ? "image"
                      : "file",
                    props: {
                      url: typeof url === "string" ? url : String(url.url),
                      name: file.name,
                    },
                  },
                ],
                editor.getTextCursorPosition().block,
                "after",
              );
            } catch {
              /* uploadFile already exposes the error without changing the document */
            }
          }}
        />
      )}
      {pending > 0 && (
        <p className="block-operation-status" aria-live="polite">
          正在处理文件…
        </p>
      )}
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => setError("")}>关闭</button>
        </p>
      )}
      {legacy_body && (
        <details className="legacy-source">
          <summary>旧版原文</summary>
          <p>转换前的 Markdown 原文已保留。</p>
          <button onClick={() => download(legacy_body, "转换前原文.md")}>
            下载原文
          </button>
        </details>
      )}
    </div>
  );
}
