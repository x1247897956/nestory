import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderObjectEditor as render } from "../../test/renderObjectEditor";
import { Events } from "./Events";
import { api } from "../../app/api";
import { defaultSettings, saveSettings } from '../settings/preferences';
const calendar = vi.hoisted(() => ({ props: {} as Record<string, any> }));
vi.mock("@fullcalendar/react", () => ({
  default: (props: Record<string, any>) => {
    calendar.props = props;
    return <div data-testid="calendar" />;
  },
}));
vi.mock("../../app/api", async (original) => ({ ...await original<typeof import("../../app/api")>(), api: vi.fn(), abandonCreateIntent: vi.fn() }));
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
it('uses calendar defaults and duration without replacing a saved project view', () => {
  saveSettings({...defaultSettings,firstDay:0,hourCycle:'12',calendarView:'timeGridWeek',eventDuration:30});
  localStorage.setItem('noteapp:view:p:events',JSON.stringify({calendarView:'dayGridMonth'}));
  render(<Events projectId="p" archived={false}/>);
  expect(calendar.props.initialView).toBe('dayGridMonth');
  expect(calendar.props.firstDay).toBe(0);
  expect(calendar.props.eventTimeFormat.hour12).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'新建日程'}));
  expect((screen.getByLabelText('新日程结束') as HTMLInputElement).value).toMatch(/T09:30$/);
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
it("saves drag changes with only original version and times, and reconciles a failed response", async () => {
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
    if (_path === "/events/e") return { ...original, version: 8, start_at: "2026-10-24T03:00:00Z" } as any;
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
  await waitFor(() => expect(calendar.props.events[0].start).toBe("2026-10-24T03:00:00Z"));
  expect(revert).not.toHaveBeenCalled();
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
it("blocks dragging when reconciliation fails and resumes only after explicit synchronization", async () => {
  const original = { id: "e", project_id: "p", title: "计划", body_document: { version: 1, blocks: [] }, start_at: "2026-10-24T01:00:00Z", end_at: "2026-10-24T02:00:00Z", version: 7 };
  let online = false;
  vi.mocked(api).mockImplementation(async (path, method) => {
    if (method === "PATCH" || (path === "/events/e" && !online)) throw new Error("网络失败");
    if (path === "/events/e") return { ...original, version: 8 } as any;
    return [original] as any;
  });
  render(<Events projectId="p" archived={false} />);
  const { act } = await import("@testing-library/react");
  act(() => calendar.props.datesSet({ startStr: "2026-10-01", endStr: "2026-11-01" }));
  await waitFor(() => expect(calendar.props.events).toHaveLength(1));
  const revert = vi.fn();
  act(() => calendar.props.eventChange({ event: { id: "e", start: new Date("2026-10-24T03:00:00Z"), end: new Date("2026-10-24T04:00:00Z") }, revert }));
  await screen.findByRole("button", { name: "同步日程" });
  expect(calendar.props.editable).toBe(false);
  expect(revert).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "同步日程" }));
  await screen.findByText("同步失败，保存结果仍未确认，请重试同步。");
  expect(calendar.props.editable).toBe(false);
  online = true;
  fireEvent.click(screen.getByRole("button", { name: "同步日程" }));
  await waitFor(() => expect(calendar.props.editable).toBe(true));
  act(() => calendar.props.eventChange({ event: { id: "e", start: new Date("2026-10-24T03:00:00Z"), end: new Date("2026-10-24T04:00:00Z") }, revert }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/events/e", "PATCH", expect.objectContaining({ version: 8 })));
});
it("remembers timeline span, date and sorting while archived projects remain read only", async () => {
  localStorage.setItem('noteapp:view:p:events',JSON.stringify({view:'timeline',span:'month',date:'2026-10-28',sort:{field:'title',direction:'desc'}}));
  const view=render(<Events projectId="p" archived />);
  expect(screen.getByRole('button',{name:'时间轴'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('button',{name:'月'})).toHaveAttribute('aria-pressed','true');
  expect(screen.queryByRole('button',{name:'新建日程'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'下一区间'}));
  expect(JSON.parse(localStorage.getItem('noteapp:view:p:events')!).date).toBe('2026-11-01');
  HTMLElement.prototype.showPopover=function(){this.style.display='block';};HTMLElement.prototype.hidePopover=function(){this.style.display='none';};
  fireEvent.click(screen.getByRole('button',{name:'排序器'}));
  fireEvent.change(screen.getByLabelText('排序字段'),{target:{value:'duration'}});
  fireEvent.click(screen.getByRole('button',{name:'应用排序'}));
  expect(JSON.parse(localStorage.getItem('noteapp:view:p:events')!).sort.field).toBe('duration');
  view.unmount();
  localStorage.removeItem('noteapp:view:p:events');
  expect(api).not.toHaveBeenCalledWith(expect.anything(),'POST',expect.anything());
});
it('preserves the calendar focused date when switching to a timeline week', async () => {
  const {act}=await import('@testing-library/react');
  const view=render(<Events projectId="focus" archived={false}/>);
  act(()=>calendar.props.datesSet({startStr:'2026-09-28',endStr:'2026-11-02',view:{type:'dayGridMonth',currentStart:new Date('2026-09-30T16:00:00Z'),calendar:{getDate:()=>new Date('2026-10-27T16:00:00Z')}}}));
  expect(JSON.parse(localStorage.getItem('noteapp:view:focus:events')!).date).toBe('2026-10-28');
  fireEvent.click(screen.getByRole('button',{name:'时间轴'}));
  expect(screen.getByRole('heading',{name:/2026年10月26日/})).toHaveTextContent('2026年10月26日');
  view.unmount();
  localStorage.removeItem('noteapp:view:focus:events');
});
