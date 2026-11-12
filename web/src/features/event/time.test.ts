import { expect, it } from "vitest";
import { toInput, fromInput, displayTime } from "./time";
import { defaultSettings, saveSettings } from '../settings/preferences';
it('formats visible times using the selected clock without changing input values', () => {
 saveSettings({...defaultSettings,hourCycle:'12'});
 expect(displayTime('2026-11-10T15:30:00+08:00','Asia/Shanghai')).toContain('03:30');
 expect(toInput('2026-11-10T15:30:00+08:00','Asia/Shanghai')).toBe('2026-11-10T15:30');
 saveSettings(defaultSettings);
});
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
