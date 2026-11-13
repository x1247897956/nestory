import {useI18n, t as tr} from "../../i18n";
import {useId,useRef,useState} from 'react';
import {randomUUID} from '../../app/uuid';
import {noValue,operators,validFilters,type TaskFilter} from './filterEngine';
import type {TaskFilterState} from './useTaskFilters';
import './task-filters.css';
export function TaskFilters({state,label:objectLabel='任务'}:{state:TaskFilterState;label?:string}){
  const {language} = useI18n();
 const {filters,setFilters,fields}=state;
 const blank=():TaskFilter=>({id:randomUUID(),field:fields.some(f=>f.id==='stage')?'stage':'title',op:fields.some(f=>f.id==='stage')?'is':'contains',value:''});
 const [draft,setDraft]=useState<TaskFilter>(blank);
 const [editing,setEditing]=useState(false);
 const [opened,setOpened]=useState(false);
 const panel=useRef<HTMLDivElement>(null);const id=useId();
 const field=fields.find(f=>f.id===draft.field);
 const open=(anchor:HTMLElement,filter?:TaskFilter)=>{
  setDraft(filter?{...filter}:blank());setEditing(!!filter);
  const popup=panel.current;if(!popup)return;
  const rect=anchor.getBoundingClientRect();
  popup.style.left=Math.max(16,Math.min(rect.left,window.innerWidth-356))+"px";
  popup.style.top=Math.max(16,Math.min(rect.bottom+8,window.innerHeight-430))+"px";
  popup.style.maxHeight=Math.max(160,window.innerHeight-parseFloat(popup.style.top)-16)+"px";
  popup.showPopover();requestAnimationFrame(()=>popup.querySelector<HTMLSelectElement>('select')?.focus());
 };
 const update=(patch:Partial<TaskFilter>)=>setDraft(old=>({...old,...patch}));
 const label=(filter:TaskFilter)=>{
  const f=fields.find(x=>x.id===filter.field);const op=f?operators[f.kind].find(([key])=>key===filter.op)?.[1]:undefined;
  const val=Array.isArray(filter.value)?filter.value.map(v=>f?.options?.find(o=>o.id===v)?.name??v).join(language==='zh-CN'?'、':', '):f?.options?.find(o=>o.id===filter.value)?.name??filter.value;
  return `${f?.name??tr("已删除属性")} · ${op?tr(op):tr("失效条件")}${noValue(filter.op)?'':` ${val}`}`;
 };
 return <div className="task-filters" aria-label={tr("{title}筛选器",{title:tr(objectLabel)})}>
  <div className="task-filter-line">
   <button className={`task-filter-trigger${filters.length?' active':''}`} type="button" aria-label={tr("筛选{title}",{title:tr(objectLabel)})} aria-expanded={opened} aria-controls={id} onClick={e=>open(e.currentTarget)} disabled={filters.length>=30}>
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 5h14M6 10h8M8 15h4"/></svg>{tr("筛选")}{filters.length>0&&<span className="task-filter-count">{filters.length}</span>}
   </button>
   {filters.map(f=><span className="task-filter-chip" key={f.id}>
    <button type="button" aria-label={tr("编辑筛选 {title}",{title:label(f)})} onClick={e=>open(e.currentTarget,f)}>{label(f)}</button>
    <button type="button" className="task-filter-remove" aria-label={tr("移除筛选 {title}",{title:label(f)})} onClick={()=>setFilters(filters.filter(x=>x.id!==f.id))}>×</button>
   </span>)}
   {filters.length>0&&<button className="task-filter-clear" type="button" onClick={()=>setFilters([])}>{tr("清除全部")}</button>}
  </div>
  <div ref={panel} id={id} popover="auto" onToggle={event=>setOpened(event.newState==='open')} className="task-filter-popover" role="dialog" aria-label={editing?tr("编辑筛选条件"):tr("添加筛选条件")}>
   <header><strong>{editing?tr("编辑筛选条件"):tr("添加筛选条件")}</strong><button type="button" aria-label={tr("关闭筛选条件")} onClick={()=>panel.current?.hidePopover()}>×</button></header>
   <label>{tr("属性")}<select aria-label={tr("筛选属性")} value={draft.field} onChange={e=>{const next=fields.find(f=>f.id===e.target.value)!;update({field:next.id,op:operators[next.kind][0][0],value:next.kind==='multi_select'?[]:''});}}>
    {!field&&<option value={draft.field}>{tr("已删除属性")}</option>}{fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
   </select></label>
   {state.properties.isPending&&<p role="status">{tr("正在加载自定义属性…")}</p>}
   {state.properties.isError&&<p role="alert">{tr("属性加载失败")} <button onClick={()=>void state.properties.refetch()}>{tr("重试加载筛选属性")}</button></p>}
   {field&&<>
    <label>{tr("条件")}<select aria-label={tr("筛选条件")} value={draft.op} onChange={e=>update({op:e.target.value,value:field.kind==='multi_select'||e.target.value==='between'?[]:''})}>{operators[field.kind].map(([op,name])=><option key={op} value={op}>{tr(name)}</option>)}</select></label>
    {!noValue(draft.op)&&(field.kind==='single_select'?<label>{tr("选项")}<select aria-label={tr("筛选值")} value={typeof draft.value==='string'?draft.value:''} onChange={e=>update({value:e.target.value})}><option value="">{tr("选择选项")}</option>{field.options?.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>:
     field.kind==='multi_select'?<fieldset><legend>{tr("选项")}</legend>{(Array.isArray(draft.value)?draft.value:[]).filter(v=>!field.options?.some(o=>o.id===v)).map(v=><label className="task-filter-option" key={v}><input type="checkbox" checked onChange={()=>update({value:(draft.value as string[]).filter(x=>x!==v)})}/>{tr("已删除选项（取消选择以移除）")}</label>)}{field.options?.length?field.options.map(o=><label className="task-filter-option" key={o.id}><input type="checkbox" checked={Array.isArray(draft.value)&&draft.value.includes(o.id)} onChange={e=>{const old=Array.isArray(draft.value)?draft.value:[];update({value:e.target.checked?[...old,o.id]:old.filter(v=>v!==o.id)});}}/>{o.name}</label>):<p>{tr("此属性暂无选项")}</p>}</fieldset>:
     field.kind==='date'&&draft.op==='between'?<div className="task-filter-date-range"><label>{tr("开始日期")}<input aria-label={tr("筛选开始日期")} type="date" value={Array.isArray(draft.value)?draft.value[0]??'':''} onChange={e=>update({value:[e.target.value,Array.isArray(draft.value)?draft.value[1]??'':'']})}/></label><label>{tr("结束日期")}<input aria-label={tr("筛选结束日期")} type="date" value={Array.isArray(draft.value)?draft.value[1]??'':''} onChange={e=>update({value:[Array.isArray(draft.value)?draft.value[0]??'':'',e.target.value]})}/></label></div>:
     <label>{field.kind==='date'?tr("日期"):tr("内容")}<input aria-label={tr("筛选值")} type={field.kind==='date'?'date':'text'} maxLength={4096} value={typeof draft.value==='string'?draft.value:''} placeholder={field.kind==='date'?undefined:tr("输入内容…")} onChange={e=>update({value:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&validFilters([draft],fields)){setFilters(editing?filters.map(f=>f.id===draft.id?draft:f):[...filters,draft]);panel.current?.hidePopover();}}}/></label>)}
   </>}
   <footer><span>{tr("同时满足所有条件")}</span><button type="button" className="primary" disabled={!validFilters([draft],fields)} onClick={()=>{setFilters(editing?filters.map(f=>f.id===draft.id?draft:f):[...filters,draft]);panel.current?.hidePopover();}}>{tr("应用筛选")}</button></footer>
  </div>
  {state.pending&&<p role="status" className="task-filter-message">{tr("正在加载筛选数据…")}</p>}
  {state.failed&&<p role="alert" className="task-filter-message">{tr("筛选数据加载失败，暂不显示结果。")}<button onClick={()=>{void state.properties.refetch();void state.config.refetch();}}>{tr("重试筛选")}</button></p>}
  {state.invalid&&<p role="alert" className="task-filter-message">{tr("部分筛选属性或选项已失效，请编辑或移除对应条件。")}</p>}
 </div>;
}
