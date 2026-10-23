import { DateTime } from "luxon";
export function toInput(iso: string, zone: string) {
  return DateTime.fromISO(iso, { zone }).toFormat("yyyy-MM-dd'T'HH:mm");
}
export function fromInput(value: string, zone: string) {
  const d = DateTime.fromISO(value, { zone });
  if (!d.isValid || d.toFormat("yyyy-MM-dd'T'HH:mm") !== value)
    throw new Error("无效时间（可能位于夏令时跳时区间）");
  if (d.getPossibleOffsets().length > 1)
    throw new Error("此时间在夏令时回拨中出现两次，请选择无歧义的时间");
  return d.toISO()!;
}
export function displayTime(iso: string, zone: string) {
  return DateTime.fromISO(iso, { zone }).toFormat("yyyy-MM-dd HH:mm");
}
