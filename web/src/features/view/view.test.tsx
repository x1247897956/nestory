import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useProjectPreferences } from './preferences';
import { normalizeSort, sortObjects } from './sorting';
const normalize = (raw: unknown) => typeof raw === 'number' ? raw : 0;
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
it('keeps project and scope choices isolated, including consecutive functional updates', () => {
 const { result, rerender } = renderHook(({ project, scope }) => useProjectPreferences(project, scope, 0, normalize), { initialProps: { project: 'a', scope: 'tasks' } });
 act(() => { result.current[1](v => v + 1); result.current[1](v => v + 1); });
 expect(result.current[0]).toBe(2);
 rerender({ project: 'b', scope: 'tasks' }); expect(result.current[0]).toBe(0);
 act(() => result.current[1](5));
 rerender({ project: 'a', scope: 'tasks' }); expect(result.current[0]).toBe(2);
 rerender({ project: 'a', scope: 'notes' }); expect(result.current[0]).toBe(0);
});
it('survives blocked storage and still applies functional updates', () => {
 vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
 vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
 const { result } = renderHook(() => useProjectPreferences('a', 'tasks', 0, normalize));
 act(() => { result.current[1](v => v + 1); result.current[1](v => v + 1); });
 expect(result.current[0]).toBe(2);
});
it('falls back on corrupt storage and normalizer failure', () => {
 vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{broken');
 const { result } = renderHook(() => useProjectPreferences('a', 'tasks', 7, () => { throw Error('invalid'); }));
 expect(result.current[0]).toBe(7);
});
it('normalizes sort against available fields and valid directions', () => {
 const fallback = { field: 'position', direction: 'asc' as const };
 expect(normalizeSort({ field: 'wrong', direction: 'desc' }, ['position'], fallback)).toEqual(fallback);
 expect(normalizeSort({ field: 'position', direction: 'wrong' }, ['position'], fallback)).toEqual(fallback);
});
it('sorts priority with missing values last in both directions without mutating', () => {
 const items = [{id:'c',title:'C',priority:'none'}, {id:'b',title:'B',priority:'low'}, {id:'a',title:'A',priority:'high'}];
 expect(sortObjects(items, {field:'priority',direction:'asc'}).map(x=>x.id)).toEqual(['b','a','c']);
 expect(sortObjects(items, {field:'priority',direction:'desc'}).map(x=>x.id)).toEqual(['a','b','c']);
 expect(items[0].id).toBe('c');
});
it('sorts numbers numerically, date instants accurately and ties by ascending ID', () => {
 const items = [{id:'b',title:'same',created_at:9,start_at:'2026-10-28T10:00:00+08:00',end_at:'2026-10-28T11:00:00+08:00'}, {id:'a',title:'same',created_at:10,start_at:'2026-10-28T01:30:00Z',end_at:'2026-10-28T03:30:00Z'}, {id:'c',title:'same'}];
 for (const field of ['created_at','start_at']) expect(sortObjects(items,{field,direction:'asc'}).map(x=>x.id)).toEqual(field==='created_at'?['b','a','c']:['a','b','c']);
 expect(sortObjects(items,{field:'duration',direction:'desc'}).map(x=>x.id)).toEqual(['a','b','c']);
 expect(sortObjects(items,{field:'title',direction:'desc'}).map(x=>x.id)).toEqual(['a','b','c']);
 expect(sortObjects(items,{field:'updated_at',direction:'desc'}).map(x=>x.id)).toEqual(['a','b','c']);
});
