import { DateTime } from 'luxon';
export type TimelineSpan = 'week' | 'month';
export function timelineRange(date: string, span: TimelineSpan, zone: string, firstDay:0|1=1) {
 const parsed = DateTime.fromISO(date, { zone });
 const anchor=parsed.isValid ? parsed : DateTime.now().setZone(zone);
 const start = span==='week' && firstDay===0 ? anchor.startOf('day').minus({days:anchor.weekday%7}) : anchor.startOf(span);
 const end = start.plus(span === 'week' ? { weeks: 1 } : { months: 1 });
 const days: DateTime[] = [];
 for (let d = start; d < end; d = d.plus({ days: 1 })) days.push(d);
 return { start, end, days };
}
// Use local day position rather than elapsed hours, including on 23/25-hour days.
export function dayPosition(value: DateTime, start: DateTime) {
 const local = value.setZone(start.zoneName!);
 const day = local.startOf('day');
 return Math.round(day.diff(start, 'days').days) + local.diff(day).milliseconds / day.plus({days:1}).diff(day).milliseconds;
}
export function barGeometry(startAt: string, endAt: string, range: ReturnType<typeof timelineRange>) {
 const start = DateTime.fromISO(startAt, {zone:range.start.zoneName!});
 const end = DateTime.fromISO(endAt, {zone:range.start.zoneName!});
 if (!start.isValid || !end.isValid || end <= start || end <= range.start || start >= range.end) return null;
 const left = Math.max(0, dayPosition(start,range.start));
 const right = Math.min(range.days.length, dayPosition(end,range.start));
 return { left:left / range.days.length * 100, width:(right-left) / range.days.length * 100 };
}
