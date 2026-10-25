import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderObjectEditor } from "../test/renderObjectEditor";
import { PageEditor } from "../features/page/Pages";
import { EventEditor } from "../features/event/Events";
import { TaskEditor } from "../features/task/TaskEditor";
vi.mock("../components/markdown/MarkdownEditor", () => ({ MarkdownEditor: ({ onPendingChange }: { onPendingChange?: (pending: boolean) => void }) => <><button onClick={() => onPendingChange?.(true)}>Start upload</button><button onClick={() => onPendingChange?.(true)}>Start import</button><button onClick={() => onPendingChange?.(false)}>Finish file</button></> }));
vi.mock("../components/object/ObjectProperties", () => ({ ObjectProperties: () => null }));
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
for (const kind of ["page", "event", "task"] as const) for (const operation of ["upload", "import", "save"] as const) it(`${kind} prevents recovery reload during ${operation} and allows it after completion`, async () => {
  let finish!: () => void;
  const save = vi.fn().mockRejectedValueOnce(Error("conflict")).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const reload = vi.fn(async () => {});
  const base = { id: "pending", project_id: "p", title: "Original", body_document: { version: 1 as const, blocks: [] }, version: 1, created_at: 0, updated_at: 0 };
  renderObjectEditor(kind === "page" ? <PageEditor page={{ ...base, parent_id: null, position: 0 }} focusTitle={false} archived={false} onSave={save} onReload={reload}/> : kind === "event" ? <EventEditor event={{ ...base, start_at: "2026-10-24T01:00:00Z", end_at: "2026-10-24T02:00:00Z" }} zone="Asia/Shanghai" archived={false} onSave={save} onReload={reload}/> : <TaskEditor task={{ ...base, stage: "todo", priority: "none", due_date: null, parent_id: null, position: 0 }} archived={false} onSave={save} onReload={reload}/>);
  fireEvent.change(screen.getByLabelText(kind === "page" ? "笔记标题" : kind === "event" ? "日程标题" : "任务标题"), { target: { value: "Changed" } });
  const button = await screen.findByRole("button", { name: "重新载入" }, { timeout: 2000 });
  if (operation === "save") {
    fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  } else fireEvent.click(screen.getByText(`Start ${operation}`));
  const activeButton = screen.queryByRole("button", { name: "重新载入" });
  if (activeButton) { expect(activeButton).toBeDisabled(); fireEvent.click(activeButton); }
  else expect(operation).toBe("save");
  expect(reload).not.toHaveBeenCalled();
  expect(window.confirm).not.toHaveBeenCalled();
  if (operation === "save") await act(async () => finish());
  else fireEvent.click(screen.getByText("Finish file"));
  // A successful retry clears the save error; file completion preserves the recovery action.
  if (operation !== "save") { expect(button).toBeEnabled(); fireEvent.click(button); await waitFor(() => expect(reload).toHaveBeenCalledOnce()); }
});
