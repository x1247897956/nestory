import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { EventEditor } from "./Events";
it("edits in deployment time and preserves Markdown on conflict", async () => {
  const save = vi.fn().mockRejectedValue(new Error("内容已更新"));
  render(
    <EventEditor
      event={{
        id: "e",
        project_id: "p",
        title: "讨论方案",
        body: "old",
        start_at: "2026-10-24T01:00:30Z",
        end_at: "2026-10-24T02:00:00Z",
        version: 1,
      }}
      zone="Asia/Shanghai"
      archived={false}
      onSave={save}
      onReload={async () => {}}
    />,
  );
  expect(screen.getByLabelText("开始时间")).toHaveValue("2026-10-24T09:00");
  fireEvent.change(screen.getByLabelText("Markdown 正文"), {
    target: { value: "本地草稿" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("内容已更新"),
  );
  expect(screen.getByLabelText("Markdown 正文")).toHaveValue("本地草稿");
  expect(save.mock.calls[0][0].start_at).toBe("2026-10-24T01:00:30Z");
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

it("preserves the original fall-back offset while only Markdown changes", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <EventEditor
      event={{
        id: "fold",
        project_id: "p",
        title: "回拨",
        body: "old",
        start_at: "2026-11-01T01:30:30-05:00",
        end_at: "2026-11-01T02:30:45-05:00",
        version: 1,
      }}
      zone="America/New_York"
      archived={false}
      onSave={save}
      onReload={async () => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Markdown 正文"), {
    target: { value: "正文" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].start_at).toBe("2026-11-01T01:30:30-05:00");
  expect(save.mock.calls[0][0].end_at).toBe("2026-11-01T02:30:45-05:00");
});
