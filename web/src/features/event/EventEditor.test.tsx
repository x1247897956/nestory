import type { BodyDocument } from "../../app/document";
import { renderObjectEditor as render } from "../../test/renderObjectEditor";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { EventEditor } from "./Events";
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("edits in deployment time and preserves Markdown on conflict", async () => {
  const save = vi.fn().mockRejectedValue(new Error("内容已更新"));
  render(
    <EventEditor
      event={{
        id: "e",
        project_id: "p",
        title: "讨论方案",
        body_document: { version: 1, blocks: [] },
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
  expect(screen.queryByRole("button", { name: "保存日程" })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("内容已更新"),
  );
  expect(screen.getByLabelText("Markdown 正文")).toHaveValue("本地草稿");
  expect(save.mock.calls[0][0].start_at).toBe("2026-10-24T01:00:30Z");
});

vi.mock("../../components/editor/LazyBlockEditor", () => ({
  LazyBlockEditor: ({
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

it("preserves the original fall-back offset while only Markdown changes", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <EventEditor
      event={{
        id: "fold",
        project_id: "p",
        title: "回拨",
        body_document: { version: 1, blocks: [] },
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
  expect(screen.queryByRole("button", { name: "保存日程" })).not.toBeInTheDocument();
  await waitFor(() => expect(save).toHaveBeenCalledOnce(), { timeout: 2000 });
  expect(save.mock.calls[0][0].start_at).toBe("2026-11-01T01:30:30-05:00");
  expect(save.mock.calls[0][0].end_at).toBe("2026-11-01T02:30:45-05:00");
});

it("keeps invalid time drafts without saving", async () => {
  const save = vi.fn();
  render(<EventEditor event={{id:"invalid",project_id:"p",title:"讨论",body_document:{version:1,blocks:[]},start_at:"2026-10-24T01:00:00Z",end_at:"2026-10-24T02:00:00Z",version:1}} zone="Asia/Shanghai" archived={false} onSave={save} onReload={async()=>{}}/>);
  fireEvent.change(screen.getByLabelText("结束时间"), {target:{value:"2026-10-24T08:00"}});
  expect(screen.getByRole("alert")).toHaveTextContent("结束时间必须晚于开始时间");
  await new Promise(resolve => setTimeout(resolve, 900));
  expect(save).not.toHaveBeenCalled();
});
it("retains recovery after a failed reload and discards only in the successful reload callback", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  let succeeded = false;
  const reload = vi.fn(async (beforeReset?: () => void) => {
    if (!succeeded) throw new Error("重新读取失败");
    beforeReset?.();
  });
  render(<EventEditor event={{ id: "reload", project_id: "p", title: "原始标题", body_document: { version: 1, blocks: [] }, start_at: "2026-10-24T01:00:00Z", end_at: "2026-10-24T02:00:00Z", version: 1 }} zone="Asia/Shanghai" archived={false} onSave={async () => { throw new Error("版本冲突"); }} onReload={reload} />);
  fireEvent.change(screen.getByLabelText("日程标题"), { target: { value: "本地标题" } });
  await screen.findByRole("button", { name: "重新载入" });
  expect(window.localStorage.length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "重新载入" }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(window.localStorage.length).toBeGreaterThan(0);
  succeeded = true;
  fireEvent.click(screen.getByRole("button", { name: "重新载入" }));
  await waitFor(() => expect(window.localStorage.length).toBe(0));
  vi.restoreAllMocks();
});
