import { useEffect, useId, useRef, useState } from "react";
import { api, ApiError } from "../../app/api";
import { randomUUID } from "../../app/uuid";
import { positionPropertyPopover, type PropertyDefinition, type PropertyValue } from "./propertyTypes";

export function PropertyChoice({definition:d,value,disabled,onChange,onDefinition}:{definition:PropertyDefinition;value:PropertyValue;disabled:boolean;onChange:(v:PropertyValue)=>void;onDefinition:(d:PropertyDefinition)=>void}) {
 const id=useId(), panel=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null), search=useRef<HTMLInputElement>(null);
 const [query,setQuery]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{if(disabled)panel.current?.hidePopover();},[disabled]);
 const selected=Array.isArray(value)?value:typeof value==="string"?[value]:[];
 const options=d.options.filter(o=>o.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const choose=(optionId:string)=>{onChange(d.kind==="single_select"?optionId:selected.includes(optionId)?selected.filter(x=>x!==optionId):[...selected,optionId]);if(d.kind==="single_select")panel.current?.hidePopover();};
 const create=async()=>{
  const name=query.trim();if(!name||disabled||busy||d.options.length>=100)return;
  setBusy(true);setError("");
  try {
   let current=d;let option=current.options.find(o=>o.name.toLocaleLowerCase()===name.toLocaleLowerCase());
   if(!option){
    const next={id:randomUUID(),name};
    try {current=await api<PropertyDefinition>(`/property-definitions/${d.id}`,"PATCH",{version:current.version,options:[...current.options,next]});option=next;}
    catch(e){
     if(!(e instanceof ApiError)||e.status!==409)throw e;
     const fresh=await api<{definitions:PropertyDefinition[]}>(`/projects/${d.project_id}/property-definitions/${d.object_type}`);
     const latest=fresh.definitions.find(x=>x.id===d.id);if(!latest)throw e;
     current=latest;option=current.options.find(o=>o.name.toLocaleLowerCase()===name.toLocaleLowerCase());
     if(!option){current=await api<PropertyDefinition>(`/property-definitions/${d.id}`,"PATCH",{version:current.version,options:[...current.options,next]});option=next;}
    }
   }
   onDefinition(current);choose(option.id);setQuery("");
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <div data-dirty={busy}>
  <button ref={trigger} className="property-value-trigger" aria-label={`属性值 ${d.name}`} disabled={disabled} popoverTarget={id} onClick={()=>{positionPropertyPopover(panel.current,trigger.current);setQuery("");setError("");requestAnimationFrame(()=>search.current?.focus());}}>
   {selected.length?d.options.filter(o=>selected.includes(o.id)).map(o=><span className="property-tag" key={o.id}>{o.name}</span>):<span className="property-empty">未选择</span>}
  </button>
  <div id={id} ref={panel} popover="auto" className="custom-property-popover property-choice" aria-label={`选择 ${d.name}`}>
   <input ref={search} aria-label="搜索或创建选项" placeholder="搜索或创建选项…" maxLength={80} value={query} disabled={busy||disabled} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="ArrowDown"){e.preventDefault();panel.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();}if(e.key==="Enter"&&!e.nativeEvent.isComposing){e.preventDefault();if(options.length)choose(options[0].id);else void create();}}}/>
   <div role="listbox" aria-label={d.name} aria-multiselectable={d.kind==="multi_select"} onKeyDown={e=>{if(!["ArrowDown","ArrowUp"].includes(e.key))return;e.preventDefault();const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));const i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(i+(e.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();}}>
    {options.map(o=><button key={o.id} role="option" aria-selected={selected.includes(o.id)} disabled={busy||disabled} onClick={()=>choose(o.id)}><span className="property-tag">{o.name}</span>{selected.includes(o.id)&&<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 10 4 4 8-8"/></svg>}</button>)}
   </div>
   {query.trim()&&!d.options.some(o=>o.name.toLocaleLowerCase()===query.trim().toLocaleLowerCase())&&d.options.length<100&&<button className="property-create-option" disabled={busy||disabled} onClick={()=>void create()}>{busy?"创建中…":`创建“${query.trim()}”`}</button>}
   {!options.length&&!query&&<p className="property-choice-hint">输入名称，创建第一个选项</p>}
   {!!selected.length&&<button className="property-clear" disabled={busy||disabled} onClick={()=>{onChange(null);panel.current?.hidePopover();}}>清空选择</button>}
   {error&&<div role="alert" className="custom-property-invalid">{error}</div>}
  </div>
 </div>;
}
