import type { BodyDocument } from "./document";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ProjectForm } from "../features/project/ProjectForm";
import { App } from "./App";
const project = {
  id: "p",
  title: "Project",
  description: "old",
  version: 1,
  archived_at: null,
  created_at: 0,
  updated_at: 0,
};
it("submits the version captured when the project form opened", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ProjectForm project={project} onSubmit={submit} onClose={() => {}} />,
  );
  fireEvent.change(screen.getByLabelText("项目说明"), {
    target: { value: "draft" },
  });
  view.rerender(
    <ProjectForm
      project={{ ...project, version: 2 }}
      onSubmit={submit}
      onClose={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "保存项目" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith("Project", "draft", 1),
  );
});
it("keeps the mounted editor when background project and task refresh fail", async () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["projects", false], [project]);
  qc.setQueryData(["project", "p"], project);
  const task = {
    id: "t",
    project_id: "p",
    title: "Task",
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
  qc.setQueryData(["tasks", "p"], [task]);
  qc.setQueryData(["task", "t"], task);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  const router = createMemoryRouter(
    [{ path: "/projects/:projectId/tasks/:taskId", element: <App /> }],
    { initialEntries: ["/projects/p/tasks/t"] },
  );
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Markdown 正文"), {
    target: { value: "unsaved draft" },
  });
  await act(async () => {
    await qc.refetchQueries({ queryKey: ["project", "p"] });
    await qc.refetchQueries({ queryKey: ["task", "t"] });
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  expect(screen.getByLabelText("Markdown 正文")).toHaveValue("unsaved draft");
  expect(screen.getByText("有未保存更改")).toBeVisible();
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
