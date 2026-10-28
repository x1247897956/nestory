import type { SortField, SortSpec } from './sorting';
import './view.css';
export function SortControl({ value, onChange, fields, label = '排序' }: {value:SortSpec; onChange:(value:SortSpec)=>void; fields:readonly SortField[]; label?:string}) {
 return <div className="view-sort-control">
  <select aria-label={`${label}字段`} value={value.field} onChange={event => onChange({...value,field:event.target.value})}>{fields.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}</select>
  <select aria-label={`${label}方向`} value={value.direction} onChange={event => onChange({...value,direction:event.target.value as SortSpec['direction']})}><option value="asc">升序</option><option value="desc">降序</option></select>
 </div>;
}
