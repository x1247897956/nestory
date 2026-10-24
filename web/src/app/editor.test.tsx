import type { BodyDocument } from "./document";
import { renderObjectEditor as render } from "../test/renderObjectEditor";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TaskEditor } from "../features/task/TaskEditor";
import type { Task } from "./api";
const task: Task = {
  id: "t",
  project_id: "p",
  title: "读论文",
  body_document: { version: 1, blocks: [] },
  stage: "todo",
  priority: "none",
  due_date: null,
  parent_id: null,
  position: 0,
  version: 1,
  created_at: 0,
  updated_at: 0,
};
describe("Task editor", () => {
  it("keeps draft visible on a version conflict", async () => {
    const save = vi.fn().mockRejectedValue(new Error("内容已更新，请重新加载"));
    render(
      <TaskEditor
        task={task}
        archived={false}
        onSave={save}
        onReload={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Markdown 正文"), {
      target: { value: "my draft" },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("内容已更新"),
    );
    expect(screen.getByLabelText("Markdown 正文")).toHaveValue("my draft");
    expect(screen.getByRole("status")).toHaveTextContent("保存失败");
    const submitted = save.mock.calls[0][0];
    expect(submitted.body_document).toEqual({
      version: 1,
      blocks: [{ type: "paragraph", content: [{ type: "text", text: "my draft", styles: {} }] }],
    });
    expect(submitted).not.toHaveProperty("body");
    expect(submitted).not.toHaveProperty("legacy_body");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    fireEvent.click(screen.getByRole("button", { name: "复制草稿" }));
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(submitted.body_document);
  });
  it("makes archived tasks read only", () => {
    render(
      <TaskEditor task={task} archived onSave={vi.fn()} onReload={() => {}} />,
    );
    expect(screen.getByLabelText("Markdown 正文")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "保存任务" }),
    ).not.toBeInTheDocument();
  });
});

it("keeps a conflict draft when explicit reload fails", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const fail = async () => {
    throw new Error("network offline");
  };
  render(
    <TaskEditor task={task} archived={false} onSave={fail} onReload={fail} />,
  );
  fireEvent.change(screen.getByLabelText("Markdown 正文"), {
    target: { value: "keep me" },
  });
  await screen.findByRole("alert", {}, { timeout: 2000 });
  fireEvent.click(screen.getByRole("button", { name: "重新载入" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("network offline"),
  );
  expect(screen.getByLabelText("Markdown 正文")).toHaveValue("keep me");
});

vi.mock("../components/markdown/MarkdownEditor", () => ({
  MarkdownEditor: ({
    body_document,
    onChange,
    disabled,
  }: {
    body_document: BodyDocument;
    onChange: (v: BodyDocument) => void;
    disabled: boolean;
  }) => (
    <textarea
      aria-label="Markdown 正文"
      value={(body_document.blocks[0]?.content as { text: string }[] | undefined)?.[0]?.text ?? ""}
      disabled={disabled}
      onChange={(e) => onChange({ version: 1, blocks: [{ type: "paragraph", content: [{ type: "text", text: e.target.value, styles: {} }] }] } as BodyDocument)}
    />
  ),
}));
it("guards navigation while a save is in flight after reverting to baseline", async () => {
  let resolve!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const { container } = render(
    <TaskEditor
      task={task}
      archived={false}
      onSave={save}
      onReload={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Markdown 正文"), {
    target: { value: "in flight" },
  });
  await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 2000 });
  fireEvent.change(screen.getByLabelText("Markdown 正文"), {
    target: { value: "" },
  });
  expect(container.querySelector('[aria-label="任务详情"]')).toHaveAttribute(
    "data-dirty",
    "true",
  );
  await act(async () => resolve());
});

it("does not send an empty title, and automatically resumes when the title becomes valid", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <TaskEditor
      task={task}
      archived={false}
      onSave={save}
      onReload={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("任务标题"), {
    target: { value: "" },
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 900));
  });
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("任务标题"), {
    target: { value: "新标题" },
  });
  await waitFor(() => expect(save).toHaveBeenCalledOnce(), { timeout: 2000 });
});
