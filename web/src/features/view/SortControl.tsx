import { useId, useRef, useState } from 'react';
import { normalizeSort, type SortField, type SortSpec } from './sorting';
import './view.css';
export function SortControl({ value, onChange, fields, label = '排序' }: {value:SortSpec; onChange:(value:SortSpec)=>void; fields:readonly SortField[]; label?:string}) {
 const fallback:SortSpec = {field:fields[0]?.value ?? '',direction:'asc'};
 const current = normalizeSort(value, fields, fallback);
 const [draft,setDraft] = useState(current);
 const [opened,setOpened] = useState(false);
 const panel = useRef<HTMLDivElement>(null);
 const anchor = useRef<HTMLElement | null>(null);
 const id = useId();
 const active = current.field !== fallback.field || current.direction !== 'asc';
 const ruleLabel = `${fields.find(field=>field.value===current.field)?.label ?? '默认顺序'} · ${current.direction==='asc'?'升序':'降序'}`;
 const close = () => { panel.current?.hidePopover(); setOpened(false); anchor.current?.focus(); };
 const open = (button:HTMLElement) => {
  setDraft(current); anchor.current=button;
  const popup=panel.current;if(!popup)return;
  const rect=button.getBoundingClientRect();
  popup.style.left=`${Math.max(16,Math.min(rect.left,window.innerWidth-356))}px`;
  popup.style.top=`${Math.max(16,Math.min(rect.bottom+8,window.innerHeight-300))}px`;
  popup.style.maxHeight=`${Math.max(160,window.innerHeight-parseFloat(popup.style.top)-16)}px`;
  popup.showPopover();setOpened(true);
  requestAnimationFrame(()=>popup.querySelector<HTMLSelectElement>('select')?.focus());
 };
 return <div className="view-sort-control">
  <button className={`view-sort-trigger${active?' active':''}`} type="button" aria-label={`${label}器`} aria-expanded={opened} aria-controls={id} disabled={!fields.length} onClick={event=>open(event.currentTarget)}>
   <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 4v12m-3-3 3 3 3-3M11 5h6m-6 5h4m-4 5h2"/></svg>排序
  </button>
  {active&&<span className="view-sort-chip"><button type="button" aria-label={`编辑排序 ${ruleLabel}`} onClick={event=>open(event.currentTarget)}>{ruleLabel}</button><button type="button" className="view-sort-remove" aria-label={`移除排序 ${ruleLabel}`} onClick={()=>onChange(fallback)}>×</button></span>}
  <div ref={panel} id={id} popover="auto" role="dialog" aria-label="排序条件" className="view-sort-popover" onToggle={event=>setOpened(event.newState==='open')} onKeyDown={event=>{
   if(event.key!=='Escape')return;
   // The first Escape belongs to an open value picker inside this panel.
   if(window.CSS?.supports?.('selector(select:open)') && event.currentTarget.querySelector('select:open'))return;
   event.preventDefault();close();
  }}>
   <header><strong>{active?'编辑排序条件':'添加排序条件'}</strong><button type="button" aria-label="关闭排序条件" onClick={close}>×</button></header>
   <label>属性<select aria-label={`${label}字段`} value={draft.field} onChange={event=>setDraft(old=>({...old,field:event.target.value}))}>{fields.map(field=><option key={field.value} value={field.value}>{field.label}</option>)}</select></label>
   <label>方向<select aria-label={`${label}方向`} value={draft.direction} onChange={event=>setDraft(old=>({...old,direction:event.target.value as SortSpec['direction']}))}><option value="asc">升序</option><option value="desc">降序</option></select></label>
   <footer><button type="button" onClick={close}>取消</button><button type="button" className="primary" disabled={!fields.length} onClick={()=>{onChange(normalizeSort(draft,fields,fallback));close();}}>应用排序</button></footer>
  </div>
 </div>;
}
