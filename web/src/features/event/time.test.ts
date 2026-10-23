import { expect, it } from "vitest";
import { toInput, fromInput } from "./time";
it("uses deployment zone for input and offset submission, including DST", () => {
  expect(toInput("2026-10-24T01:00:00Z", "Asia/Shanghai")).toBe(
    "2026-10-24T09:00",
  );
  expect(fromInput("2026-10-24T09:00", "Asia/Shanghai")).toBe(
    "2026-10-24T09:00:00.000+08:00",
  );
  expect(fromInput("2026-07-01T09:00", "America/New_York")).toBe(
    "2026-07-01T09:00:00.000-04:00",
  );
  expect(() => fromInput("2026-03-08T02:30", "America/New_York")).toThrow();
});

it("rejects ambiguous fall-back wall times", () => {
  expect(() => fromInput("2026-11-01T01:30", "America/New_York")).toThrow();
});
