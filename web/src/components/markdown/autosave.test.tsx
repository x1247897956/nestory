import { renderHook, act } from "@testing-library/react";
import { it, expect, vi } from "vitest";
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
