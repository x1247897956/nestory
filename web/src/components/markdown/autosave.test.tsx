import { StrictMode } from "react";
import { renderHook, act } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { useAutosave } from "./useAutosave";
it("debounces, serializes snapshots and preserves newer input", async () => {
  vi.useFakeTimers();
  let done!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
  );
  const { result } = renderHook(() => useAutosave<string>("a", 1, save));
  act(() => result.current.setDraft("b"));
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(save).toHaveBeenCalledWith("b", 1);
  act(() => result.current.setDraft("c"));
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => done());
  expect(result.current.draft).toBe("c");
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(save).toHaveBeenLastCalledWith("c", 2);
  vi.useRealTimers();
});
it("retains failed draft and retries explicitly", async () => {
  vi.useFakeTimers();
  const save = vi
    .fn()
    .mockRejectedValueOnce(Error("409 conflict"))
    .mockResolvedValue(undefined);
  const { result } = renderHook(() => useAutosave<string>("a", 1, save));
  act(() => result.current.setDraft("全文"));
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(result.current.error).toContain("409");
  expect(result.current.draft).toBe("全文");
  await act(() => result.current.save());
  expect(result.current.dirty).toBe(false);
  vi.useRealTimers();
});
it.each(["500 server error", "network offline", "409 conflict"])(
  "preserves full draft after %s and guards closing",
  async (message) => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValue(Error(message));
    const { result } = renderHook(() => useAutosave<string>("saved", 1, save));
    act(() => result.current.setDraft("中文全文\n```code```"));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.draft).toBe("中文全文\n```code```");
    expect(result.current.error).toBe(message);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  },
);

afterEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });
it("recovers synchronously persisted edits and saves after remount", async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue(undefined);
  const first = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "recovery"));
  act(() => first.result.current.setDraft("全文"));
  first.unmount();
  const second = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "recovery"));
  expect(second.result.current.draft).toBe("全文");
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(save).toHaveBeenCalledWith("全文", 1);
  expect(second.result.current.dirty).toBe(false);
});
it("pauses recovered drafts when server changed, even on explicit save", async () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const first = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "conflict"));
  act(() => first.result.current.setDraft("mine"));
  first.unmount();
  const next = renderHook(() => useAutosave<string>("theirs", 2, save, false, undefined, "conflict"));
  expect(next.result.current.draft).toBe("mine");
  expect(next.result.current.error).toBeTruthy();
  await act(() => next.result.current.save());
  expect(save).not.toHaveBeenCalled();
});
it("recognizes backend commit before lost acknowledgement", () => {
  const first = renderHook(() => useAutosave<string>("a", 1, vi.fn(), false, undefined, "ack"));
  act(() => first.result.current.setDraft("b"));
  first.unmount();
  const next = renderHook(() => useAutosave<string>("b", 2, vi.fn(), false, undefined, "ack"));
  expect(next.result.current.dirty).toBe(false);
  expect(next.result.current.error).toBe("");
});
it("reports quota failure without dropping the edit", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("quota"); });
  const hook = renderHook(() => useAutosave<string>("a", 1, vi.fn(), false, undefined, "quota"));
  act(() => hook.result.current.setDraft("b"));
  expect(hook.result.current.draft).toBe("b");
  expect(hook.result.current.error).toContain("本地");
});
it("keeps newer persistent edits after an older save acknowledges", async () => {
  vi.useFakeTimers();
  let done!: () => void;
  const save = vi.fn(() => new Promise<void>(resolve => { done = resolve; }));
  const first = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "late"));
  act(() => first.result.current.setDraft("b"));
  await act(() => vi.advanceTimersByTimeAsync(800));
  act(() => first.result.current.setDraft("c"));
  await act(async () => done());
  first.unmount();
  const next = renderHook(() => useAutosave<string>("b", 2, save, false, undefined, "late"));
  expect(next.result.current.draft).toBe("c");
  expect(next.result.current.error).toBe("");
});
it("preserves separate drafts when another editor has unsaved work", async () => {
  const save = vi.fn();
  const first = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "tabs"));
  act(() => first.result.current.setDraft("first"));
  const next = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "tabs"));
  expect(next.result.current.error).toBeTruthy();
  act(() => next.result.current.setDraft("second"));
  expect(window.localStorage.length).toBe(2);
  await act(() => next.result.current.save());
  expect(save).not.toHaveBeenCalled();
});
it("restores readonly drafts without saving", async () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const first = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "readonly"));
  act(() => first.result.current.setDraft("b"));
  first.unmount();
  const next = renderHook(() => useAutosave<string>("a", 1, save, true, undefined, "readonly"));
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(next.result.current.draft).toBe("b");
  expect(save).not.toHaveBeenCalled();
  act(() => next.result.current.discardRecovery());
  expect(window.localStorage.length).toBe(0);
});

it("retains recovery through StrictMode effect replay", async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue(undefined);
  const first = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "strict"));
  act(() => first.result.current.setDraft("b"));
  first.unmount();
  const next = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "strict"),
    { wrapper: StrictMode });
  expect(next.result.current.draft).toBe("b");
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(save).toHaveBeenCalledTimes(1);
});
it("can edit a restored draft and recover again without a false collision", () => {
  const save = vi.fn();
  const first = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "again"));
  act(() => first.result.current.setDraft("b"));
  first.unmount();
  const second = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "again"));
  act(() => second.result.current.setDraft("c"));
  second.unmount();
  const third = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "again"));
  expect(third.result.current.draft).toBe("c");
  expect(third.result.current.error).toBe("");
});

it("preserves foreign-tab records and confirmed reload ignores only their current contents", async () => {
  vi.useFakeTimers();
  const save = vi.fn();
  window.name = "noteapp-tab:tab-a"; window.sessionStorage.setItem("noteapp:tab-owner:v1", "tab-a");
  const first = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "foreign"));
  act(() => first.result.current.setDraft("foreign text"));
  first.unmount(); // Simulate a different JS realm without the active-set protection.
  const foreignRaw = window.localStorage.getItem(window.localStorage.key(0)!);
  window.name = "noteapp-tab:tab-b"; window.sessionStorage.setItem("noteapp:tab-owner:v1", "tab-b");
  const next = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "foreign"));
  expect(next.result.current.error).toBeTruthy();
  await act(() => next.result.current.save());
  expect(save).not.toHaveBeenCalled();
  act(() => next.result.current.discardRecovery());
  expect(window.localStorage.getItem(window.localStorage.key(0)!)).toBe(foreignRaw);
  next.unmount();
  const reloaded = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "foreign"));
  expect(reloaded.result.current.draft).toBe("a");
  expect(reloaded.result.current.error).toBe("");
});
it("shows a foreign draft again when its contents change after dismissal", () => {
  window.name = "noteapp-tab:tab-a"; window.sessionStorage.setItem("noteapp:tab-owner:v1", "tab-a");
  const first = renderHook(() => useAutosave<string>("a", 1, vi.fn(), false, undefined, "updated-foreign"));
  act(() => first.result.current.setDraft("foreign"));
  first.unmount();
  const key = window.localStorage.key(0)!;
  window.name = "noteapp-tab:tab-b"; window.sessionStorage.setItem("noteapp:tab-owner:v1", "tab-b");
  const next = renderHook(() => useAutosave<string>("a", 1, vi.fn(), false, undefined, "updated-foreign"));
  act(() => next.result.current.discardRecovery());
  next.unmount();
  const record = JSON.parse(window.localStorage.getItem(key)!);
  window.localStorage.setItem(key, JSON.stringify({ ...record, draft: "updated foreign" }));
  const reloaded = renderHook(() => useAutosave<string>("a", 1, vi.fn(), false, undefined, "updated-foreign"));
  expect(reloaded.result.current.draft).toBe("updated foreign");
  expect(reloaded.result.current.error).toContain("冲突");
});
it("does not remove a foreign draft even when it matches the server", () => {
  window.name = "noteapp-tab:tab-a"; window.sessionStorage.setItem("noteapp:tab-owner:v1", "tab-a");
  const first = renderHook(() => useAutosave<string>("a", 1, vi.fn(), false, undefined, "foreign-ack"));
  act(() => first.result.current.setDraft("b"));
  first.unmount();
  window.name = "noteapp-tab:tab-b"; window.sessionStorage.setItem("noteapp:tab-owner:v1", "tab-b");
  const next = renderHook(() => useAutosave<string>("b", 2, vi.fn(), false, undefined, "foreign-ack"));
  expect(next.result.current.error).toContain("冲突");
  expect(window.localStorage.length).toBe(1);
});
it("throws on failed discard so callers abort remount and retain the draft", () => {
  const hook = renderHook(() => useAutosave<string>("a", 1, vi.fn(), false, undefined, "failed-discard"));
  act(() => hook.result.current.setDraft("keep me"));
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw Error("storage unavailable"); });
  act(() => expect(() => hook.result.current.discardRecovery()).toThrow());
  expect(hook.result.current.draft).toBe("keep me");
  expect(hook.result.current.error).toContain("本地");
});
it("explicitly adopts a foreign recovery against the unchanged server", async () => {
  vi.useFakeTimers();
  window.name = "noteapp-tab:lost-tab"; window.sessionStorage.setItem("noteapp:tab-owner:v1", "lost-tab");
  const first = renderHook(() => useAutosave<string>("a", 4, vi.fn(), false, undefined, "adopt"));
  act(() => first.result.current.setDraft("recovered"));
  first.unmount();
  const foreignKey = window.localStorage.key(0)!;
  window.name = "noteapp-tab:new-tab"; window.sessionStorage.setItem("noteapp:tab-owner:v1", "new-tab");
  const save = vi.fn().mockResolvedValue(undefined);
  const next = renderHook(() => useAutosave<string>("a", 4, save, false, undefined, "adopt"));
  expect(next.result.current.canRecover).toBe(true);
  act(() => next.result.current.recover());
  expect(next.result.current.error).toBe("");
  expect(window.localStorage.getItem(foreignKey)).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(800));
  expect(save).toHaveBeenCalledWith("recovered", 4);
  expect(window.localStorage.getItem(foreignKey)).toBeTruthy();
  next.unmount();
  const again = renderHook(() => useAutosave<string>("recovered", 5, save, false, undefined, "adopt"));
  expect(again.result.current.error).toBe("");
});
it("blocks adoption against a changed server version", () => {
  const first = renderHook(() => useAutosave<string>("a", 1, vi.fn(), false, undefined, "stale-adopt"));
  act(() => first.result.current.setDraft("recovered"));
  first.unmount();
  const next = renderHook(() => useAutosave<string>("a", 2, vi.fn(), false, undefined, "stale-adopt"));
  expect(next.result.current.canRecover).toBe(false);
  act(() => next.result.current.recover());
  expect(next.result.current.error).toContain("冲突");
});
it("keeps adoption paused if writing the durable copy fails", async () => {
  window.name = "noteapp-tab:lost-tab"; window.sessionStorage.setItem("noteapp:tab-owner:v1", "lost-tab");
  const first = renderHook(() => useAutosave<string>("a", 1, vi.fn(), false, undefined, "adopt-quota"));
  act(() => first.result.current.setDraft("recovered"));
  first.unmount();
  window.name = "noteapp-tab:new-tab"; window.sessionStorage.setItem("noteapp:tab-owner:v1", "new-tab");
  const save = vi.fn();
  const next = renderHook(() => useAutosave<string>("a", 1, save, false, undefined, "adopt-quota"));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("quota"); });
  act(() => next.result.current.recover());
  expect(next.result.current.error).toContain("本地");
  await act(() => next.result.current.save());
  expect(save).not.toHaveBeenCalled();
});
