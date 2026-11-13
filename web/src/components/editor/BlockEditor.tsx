import { useObjectPortal } from "../object/ObjectDialog";
import { useSettings, useResolvedTheme } from '../../features/settings/preferences';
import { useCallback, useEffect, useRef, useState, useId, memo, useMemo } from "react";
import {
  BlockNoteEditor,
  filterSuggestionItems,
  type Block,
  type PartialBlock,
} from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {useI18n, t, translateError} from "../../i18n";
import {refreshLocale} from "./refreshLocale";
import {editorDictionary, placeholderRules} from "./editorLocale";
import { BlockNoteView } from "@blocknote/ariakit";
import {
  SideMenuController,
  FormattingToolbarController,
  FormattingToolbar,
  blockTypeSelectItems,
  type FormattingToolbarProps,
  AddBlockButton,
  useBlockNoteEditor,
  useExtensionState,
  useComponentsContext,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import "@blocknote/ariakit/style.css";
import "./editor.css";

import type { BodyDocument, DocumentFields } from "../../app/document";

type Props = DocumentFields & {
  onChange: (document: BodyDocument) => void;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
  projectId?: string;
};
function FileCommandIcon({ action }: { action: "upload" | "import" | "export" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {action === "upload" ? <path d="M8 12.5l6-6a3.5 3.5 0 015 5l-8 8a5 5 0 01-7-7l8-8M7 15l8-8" /> : <>
        <path d="M14 2H5v20h14V7zM14 2v5h5" />
        {action === "import" ? <path d="M12 11v7m-3-3l3 3 3-3" /> : <path d="M12 18v-7m-3 3l3-3 3 3" />}
      </>}
    </svg>
  );
}
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
  useI18n();
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
        aria-label={t("打开菜单")}
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
          {t("复制块")}
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
          {t("删除块")}
        </button>
      </div>
    </components.SideMenu.Root>
  );
}
function LocalizedFormattingToolbar(props:FormattingToolbarProps) {
  const editor=useBlockNoteEditor();
  const {language}=useI18n();
  const items=useMemo(()=>blockTypeSelectItems(editor),[editor,language]);
  return <FormattingToolbar {...props} blockTypeSelectItems={items}/>;
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
  const portal = useObjectPortal();
  const theme = useResolvedTheme();
  const {language} = useI18n();
  // Dictionary is per editor; update presentation without replacing its document.
  Object.assign(editor.dictionary, editorDictionary(language));
  return (
    <BlockNoteView
      editor={editor}
      portalElements={portal ? { default: portal } : undefined}
      editable={!disabled}
      theme={theme}
      onChange={emit}
      formattingToolbar={false}
      slashMenu={false}
      sideMenu={false}
    >
      {!disabled && <FormattingToolbarController portalElement={portal} formattingToolbar={LocalizedFormattingToolbar}/>}
      {!disabled && <SideMenuController portalElement={portal} sideMenu={ObjectSideMenu} floatingUIOptions={{
        // BlockNote renders closing menus as inert HTML snapshots. Remove them
        // immediately so a fast pointer cannot click a handle without handlers.
        useTransitionStylesProps: { duration: { open: 250, close: 0 } },
        useTransitionStatusProps: { duration: { open: 250, close: 0 } },
      }} />}
      {!disabled && (
        <SuggestionMenuController
          portalElement={portal}
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...getDefaultReactSlashMenuItems(editor),
                {
                  title: t("上传附件"),
                  icon: <FileCommandIcon action="upload" />,
                  subtext: t("插入图片或文件"),
                  aliases: ["attachment", "upload", "附件"],
                  group: t("文件"),
                  onItemClick: () => attachmentInput.current?.click(),
                },
                {
                  title: t("导入 Markdown"),
                  icon: <FileCommandIcon action="import" />,
                  subtext: t("在当前光标处插入 .md 文件"),
                  aliases: ["import", "markdown"],
                  group: t("文件"),
                  onItemClick: () => importInput.current?.click(),
                },
                {
                  title: t("导出 Markdown"),
                  icon: <FileCommandIcon action="export" />,
                  subtext: t("下载当前正文的 Markdown 副本"),
                  aliases: ["export", "markdown"],
                  group: t("文件"),
                  onItemClick: () =>
                    download(
                      editor.blocksToMarkdownLossy(editor.document),
                      t("正文.md"),
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
  body_document,
  onChange,
  disabled = false,
  projectId,
  onPendingChange,
}: Props) {
  const settings = useSettings();
  const {language} = useI18n();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  useEffect(() => { onPendingChange?.(pending > 0); }, [pending, onPendingChange]);
  const locked = useRef(disabled);
  locked.current = disabled;
  const latest = useRef({
    document: JSON.stringify(body_document),
    onChange,
  });
  latest.current.onChange = onChange;
  // Our parent echoes emitted documents back as props. An older echo may
  // commit after a newer native transaction; it must never replace that edit.
  // Weak identity tracking does not retain historical multi-megabyte bodies.
  const acknowledgedDocuments = useRef(new WeakSet<BodyDocument>(body_document ? [body_document] : []));
  const importInput = useRef<HTMLInputElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [loaded] = useState(() => {
    try {
      const instance = BlockNoteEditor.create({
        dictionary: editorDictionary(language),
        domAttributes: {
          editor: {
            "aria-label": t("Markdown 正文"),
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
      return { editor: instance, error: "" };
    } catch (e) {
      return {
        editor: null,
        error: `正文加载失败，原始内容未修改：${(e as Error).message}`,
      };
    }
  });
  const editor = loaded.editor;
  const previousLanguage=useRef(language);
  useEffect(()=>{
    if(!editor||previousLanguage.current===language)return;
    previousLanguage.current=language;
    if(editor.prosemirrorView)return refreshLocale(editor.prosemirrorView);
  },[editor,language]);
  useEffect(() => {
    editor?.domElement?.setAttribute('spellcheck',String(settings.spellCheck));
    editor?.domElement?.setAttribute('aria-label',t('Markdown 正文'));
  },[editor,settings.spellCheck,language]);
  useEffect(() => {
    if (!editor) return;
    if (body_document && acknowledgedDocuments.current.has(body_document)) return;
    const next = JSON.stringify(body_document);
    if (next === latest.current.document) return;
    try {
      editor.replaceBlocks(
        editor.document,
        body_document?.blocks.length
          ? body_document.blocks
          : [{ type: "paragraph" }],
      );
      latest.current.document = next;
      if (body_document) acknowledgedDocuments.current.add(body_document);
    } catch (e) {
      setError(`正文同步失败，草稿已保留：${(e as Error).message}`);
    }
  }, [body_document, editor]);
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
    const doc: BodyDocument = { version: 1, blocks };
    acknowledgedDocuments.current.add(doc);
    latest.current.document = JSON.stringify(doc);
    latest.current.onChange(doc);
  }, [editor]);
  if (!editor)
    return (
      <div role="alert">
        {translateError(error || loaded.error)}
        <button onClick={() => navigator.clipboard.writeText(JSON.stringify(body_document, null, 2)).catch(() => setError("复制失败，请重试"))}>{t("复制草稿 JSON")}</button>
      </div>
    );
  return (
    <div className="block-editor" data-language={language} data-dirty={pending > 0}>
      <style>{placeholderRules(language)}</style>
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
        aria-label={t("导入 Markdown")}
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
          aria-label={t("上传附件")}
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
          {t("正在处理文件…")}
        </p>
      )}
      {error && (
        <p role="alert">
          {translateError(error)}
          <button onClick={() => setError("")}>{t("关闭")}</button>
        </p>
      )}
    </div>
  );
}
