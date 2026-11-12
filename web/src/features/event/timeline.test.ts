import { expect, it } from 'vitest';
import { timelineRange, barGeometry } from './timeline';
it('starts Sunday weeks on the preceding Sunday, including Sunday itself',()=>{
 expect(timelineRange('2026-11-10','week','Asia/Shanghai',0).start.toISODate()).toBe('2026-11-08');
 expect(timelineRange('2026-11-08','week','Asia/Shanghai',0).start.toISODate()).toBe('2026-11-08');
});
it('uses Monday weeks and half-open month ranges in the application timezone', () => {
 const week = timelineRange('2026-10-28', 'week', 'Asia/Shanghai');
 expect(week.start.toISODate()).toBe('2026-10-26');
 expect(week.end.toISODate()).toBe('2026-11-02');
 expect(week.days).toHaveLength(7);
 expect(timelineRange('2026-02-14', 'month', 'Asia/Shanghai').days).toHaveLength(28);
});
it('clips overlap and excludes touching endpoints', () => {
 const range = timelineRange('2026-10-28', 'week', 'UTC');
 expect(barGeometry('2026-10-25T00:00:00Z','2026-10-27T00:00:00Z',range)?.width).toBeCloseTo(100/7);
 expect(barGeometry('2026-11-02T00:00:00Z','2026-11-03T00:00:00Z',range)).toBeNull();
 expect(barGeometry('2026-10-25T00:00:00Z','2026-10-26T00:00:00Z',range)).toBeNull();
});
it('keeps calendar-day widths equal across daylight saving transitions', () => {
 const range = timelineRange('2026-03-08', 'week', 'America/New_York');
 expect(barGeometry('2026-03-08T00:00:00-05:00','2026-03-09T00:00:00-04:00',range)?.width).toBeCloseTo(100/7);
});
