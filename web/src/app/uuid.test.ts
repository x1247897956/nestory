import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "./uuid";
afterEach(() => vi.unstubAllGlobals());
it("uses cryptographic random bytes without secure-context randomUUID", () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => { bytes.fill(255); return bytes; });
  vi.stubGlobal("crypto", { getRandomValues });
  expect(randomUUID()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  expect(getRandomValues).toHaveBeenCalledOnce();
});
it("prefers the native secure-context generator", () => {
  vi.stubGlobal("crypto", { randomUUID: () => "native" });
  expect(randomUUID()).toBe("native");
});
