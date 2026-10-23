import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TaskEditor } from "../features/task/TaskEditor";
import type { Task } from "./api";
const task: Task = {
  id: "t",
  project_id: "p",
  title: "读论文",
  body: "old",
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
    fireEvent.click(screen.getByRole("button", { name: "保存任务" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("内容已更新"),
    );
    expect(screen.getByLabelText("Markdown 正文")).toHaveValue("my draft");
    expect(screen.getByText("有未保存更改")).toBeVisible();
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
  fireEvent.click(screen.getByRole("button", { name: "保存任务" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "重新载入" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("network offline"),
  );
  expect(screen.getByLabelText("Markdown 正文")).toHaveValue("keep me");
});

vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
    editable,
  }: {
    value: string;
    onChange: (v: string) => void;
    editable: boolean;
  }) => (
    <textarea
      aria-label="Markdown 正文"
      value={value}
      disabled={!editable}
      onChange={(e) => onChange(e.target.value)}
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
  fireEvent.click(screen.getByRole("button", { name: "保存任务" }));
  fireEvent.change(screen.getByLabelText("Markdown 正文"), {
    target: { value: task.body },
  });
  expect(container.querySelector('[aria-label="任务详情"]')).toHaveAttribute(
    "data-dirty",
    "true",
  );
  await act(async () => resolve());
});
