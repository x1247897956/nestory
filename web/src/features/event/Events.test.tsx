import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderObjectEditor as render } from "../../test/renderObjectEditor";
import { Events } from "./Events";
import { api } from "../../app/api";
const calendar = vi.hoisted(() => ({ props: {} as Record<string, any> }));
vi.mock("@fullcalendar/react", () => ({
  default: (props: Record<string, any>) => {
    calendar.props = props;
    return <div data-testid="calendar" />;
  },
}));
vi.mock("../../app/api", () => ({ api: vi.fn() }));
beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (_path, method) =>
    method === "POST" ? { id: "created" } : ([] as any),
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
it("defaults to month, opens a compact timed draft at 09:00 and creates automatically", async () => {
  render(<Events projectId="p" archived={false} />);
  expect(calendar.props.initialView).toBe("dayGridMonth");
  expect(calendar.props.allDaySlot).toBe(false);
  expect(calendar.props.scrollTime).toBe("08:00:00");
  fireEvent.click(screen.getByRole("button", { name: "新建日程" }));
  expect(screen.getByRole("dialog", { name: "新建日程" })).toBeVisible();
  expect(
    (screen.getByLabelText("新日程开始") as HTMLInputElement).value,
  ).toMatch(/T09:00$/);
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("新日程标题"), {
    target: { value: "计划" },
  });
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(false);
  expect(
    screen.queryByRole("button", { name: "创建日程" }),
  ).not.toBeInTheDocument();
  await waitFor(
    () =>
      expect(api).toHaveBeenCalledWith(
        "/projects/p/events",
        "POST",
        expect.objectContaining({ title: "计划" }),
      ),
    { timeout: 2000 },
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  ).toBe(true);
});
it("does not create invalid intervals and freezes a valid draft during its request", async () => {
  let resolve: (value: any) => void = () => {};
  vi.mocked(api).mockImplementation(async (_path, method) =>
    method === "POST"
      ? new Promise((r) => {
          resolve = r;
        })
      : ([] as any),
  );
  render(<Events projectId="p" archived={false} />);
  fireEvent.click(screen.getByRole("button", { name: "新建日程" }));
  const start = (screen.getByLabelText("新日程开始") as HTMLInputElement).value;
  fireEvent.change(screen.getByLabelText("新日程结束"), {
    target: { value: start },
  });
  fireEvent.change(screen.getByLabelText("新日程标题"), {
    target: { value: "计划" },
  });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "结束时间必须晚于开始时间",
  );
  await new Promise((r) => setTimeout(r, 900));
  expect(api).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("新日程结束"), {
    target: { value: start.replace("T09:00", "T10:00") },
  });
  await waitFor(
    () => expect(screen.getByLabelText("新日程标题")).toBeDisabled(),
    { timeout: 2000 },
  );
  resolve({ id: "created" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});
it("saves drag changes with only original version and times, and reverts a failed request", async () => {
  const original = {
    id: "e",
    project_id: "p",
    title: "计划",
    body_document: { version: 1, blocks: [] },
    start_at: "2026-10-24T01:00:00Z",
    end_at: "2026-10-24T02:00:00Z",
    version: 7,
  };
  vi.mocked(api).mockImplementation(async (_path, method) => {
    if (method === "PATCH") throw new Error("版本冲突");
    return [original] as any;
  });
  render(<Events projectId="p" archived={false} />);
  const { act } = await import("@testing-library/react");
  act(() =>
    calendar.props.datesSet({ startStr: "2026-10-01", endStr: "2026-11-01" }),
  );
  await waitFor(() => expect(calendar.props.events).toHaveLength(1));
  const revert = vi.fn();
  act(() =>
    calendar.props.eventChange({
      event: {
        id: "e",
        start: new Date("2026-10-24T03:00:00Z"),
        end: new Date("2026-10-24T04:00:00Z"),
      },
      revert,
    }),
  );
  await waitFor(() => expect(revert).toHaveBeenCalledOnce());
  expect(api).toHaveBeenCalledWith("/events/e", "PATCH", {
    start_at: "2026-10-24T03:00:00.000Z",
    end_at: "2026-10-24T04:00:00.000Z",
    version: 7,
  });
  expect(screen.getByRole("alert")).toHaveTextContent("版本冲突");
});
it("retains a failed creation draft and retries without a routine save button", async () => {
  vi.mocked(api)
    .mockRejectedValueOnce(new Error("网络失败"))
    .mockResolvedValue({ id: "created" });
  render(<Events projectId="p" archived={false} />);
  fireEvent.click(screen.getByRole("button", { name: "新建日程" }));
  fireEvent.change(screen.getByLabelText("新日程标题"), {
    target: { value: "保留草稿" },
  });
  await waitFor(
    () => expect(screen.getByRole("alert")).toHaveTextContent("网络失败"),
    { timeout: 2000 },
  );
  expect(screen.getByLabelText("新日程标题")).toHaveValue("保留草稿");
  fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(api).toHaveBeenCalledTimes(2);
});
