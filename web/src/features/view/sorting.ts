export type SortSpec = { field: string; direction: 'asc' | 'desc' };
export type SortField = { value: string; label: string };
export const taskSortFields: SortField[] = [
 {value:'position',label:'默认顺序'}, {value:'title',label:'标题'}, {value:'priority',label:'优先级'}, {value:'due_date',label:'截止日期'}, {value:'created_at',label:'创建时间'}, {value:'updated_at',label:'更新时间'},
];
export const noteSortFields: SortField[] = taskSortFields.filter(field => !['priority','due_date'].includes(field.value));
export const eventSortFields: SortField[] = [{value:'start_at',label:'开始时间'}, {value:'end_at',label:'结束时间'}, {value:'title',label:'标题'}, {value:'duration',label:'时长'}];
export function normalizeSort(raw: unknown, allowedFields: readonly (string | SortField)[], defaultSort: SortSpec): SortSpec {
 if (!raw || typeof raw !== 'object') return {...defaultSort};
 const candidate = raw as Partial<SortSpec>;
 return allowedFields.some(field => (typeof field === 'string' ? field : field.value) === candidate.field) && (candidate.direction === 'asc' || candidate.direction === 'desc')
  ? {field: candidate.field!, direction:candidate.direction} : {...defaultSort};
}
function instant(raw: unknown): number | null {
 if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
 if (typeof raw !== 'string' || !raw.trim()) return null;
 const parsed = Date.parse(raw);
 return Number.isFinite(parsed) ? parsed : null;
}
function valueFor(item: Record<string, unknown>, field: string): string | number | null {
 const raw = item[field];
 if (field === 'duration') {
  const start = instant(item.start_at), end = instant(item.end_at);
  return start === null || end === null || end < start ? null : end - start;
 }
 if (field === 'priority') return ({low:0,medium:1,high:2} as Record<string, number>)[String(raw)] ?? null;
 if (['due_date','created_at','updated_at','start_at','end_at'].includes(field)) return instant(raw);
 if (field === 'position') return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
 if (field === 'title') return typeof raw === 'string' && raw.trim() ? raw : null;
 return null;
}
export function sortObjects<T extends {id:string; title:string}>(items: T[], sort: SortSpec): T[] {
 return [...items].sort((a,b) => {
  const left = valueFor(a, sort.field), right = valueFor(b, sort.field);
  if (left === null && right !== null) return 1;
  if (right === null && left !== null) return -1;
  const compared = left === null || right === null ? 0 : typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'zh-CN');
  return (sort.direction === 'desc' ? -compared : compared) || a.id.localeCompare(b.id);
 });
}
