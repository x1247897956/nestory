import {useI18n,translateError} from "../../i18n";
import { useEffect, useId, useRef, useState } from "react";
import { OptionSettings } from "./OptionSettings";
import { api, ApiError } from "../../app/api";
import { randomUUID } from "../../app/uuid";
import { optionColor, positionPropertyPopover, type PropertyDefinition, type PropertyValue } from "./propertyTypes";

export function PropertyChoice({definition:d,value,disabled,pending,onChange,onDefinition,onOptionDeleted}:{definition:PropertyDefinition;value:PropertyValue;disabled:boolean;pending:boolean;onOptionDeleted:(d:PropertyDefinition|undefined)=>Promise<void>;onChange:(v:PropertyValue)=>void;onDefinition:(d:PropertyDefinition)=>void}) {
 const {t}=useI18n();
 const id=useId(), panel=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null), search=useRef<HTMLInputElement>(null);
 const [query,setQuery]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{if(disabled)panel.current?.hidePopover();},[disabled]);
 const menuId=useId(), menu=useRef<HTMLDivElement>(null);
 const [menuOption,setMenuOption]=useState<(typeof d.options)[number]|null>(null),[optionPending,setOptionPending]=useState(false);
 const selected=Array.isArray(value)?value:typeof value==="string"?[value]:[];
 const selectedOptions=d.options.filter(o=>selected.includes(o.id));
 const options=d.options.filter(o=>o.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const choose=(optionId:string)=>{if(disabled||busy||optionPending)return;onChange(d.kind==="single_select"?optionId:selected.includes(optionId)?selected.filter(x=>x!==optionId):[...selected,optionId]);if(d.kind==="single_select")panel.current?.hidePopover();};
 const create=async()=>{
  const name=query.trim();if(!name||disabled||busy||optionPending||d.options.length>=100)return;
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
  <button ref={trigger} className="property-value-trigger" aria-label={t("属性值 {title}",{title:d.name})} disabled={disabled} popoverTarget={id} onClick={()=>{positionPropertyPopover(panel.current,trigger.current);setQuery("");setError("");requestAnimationFrame(()=>search.current?.focus());}}>
   {selectedOptions.length?selectedOptions.map(o=><span className="property-tag" data-color={optionColor(o.color)} key={o.id}>{o.name}</span>):<span className="property-empty">{t("未选择")}</span>}
  </button>
  <div id={id} ref={panel} popover="auto" className="custom-property-popover property-choice" aria-label={t("选择 {title}",{title:d.name})}>
   <input ref={search} aria-label={t("搜索或创建选项")} placeholder={t("搜索或创建选项…")} maxLength={80} value={query} disabled={busy||disabled||optionPending} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="ArrowDown"){e.preventDefault();panel.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();}if(e.key==="Enter"&&!e.nativeEvent.isComposing){e.preventDefault();if(options.length)choose(options[0].id);else void create();}}}/>
   <div role="listbox" aria-label={d.name} aria-multiselectable={d.kind==="multi_select"} onKeyDown={e=>{if(!["ArrowDown","ArrowUp"].includes(e.key))return;e.preventDefault();const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));const i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(i+(e.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();}}>
    {options.map(o=><div className="property-choice-row" key={o.id}>
     <button role="option" aria-selected={selected.includes(o.id)} disabled={busy||disabled||optionPending} onClick={()=>choose(o.id)}><span className="property-tag" data-color={optionColor(o.color)}>{o.name}</span>{selected.includes(o.id)&&<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 10 4 4 8-8"/></svg>}</button>
     {!disabled&&<button className="option-more" aria-label={t("设置选项 {title}",{title:o.name})} popoverTarget={menuId} disabled={busy||pending||(optionPending&&menuOption?.id!==o.id)} onClick={e=>{setMenuOption(o);positionPropertyPopover(menu.current,e.currentTarget);}}><svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="16" cy="10" r="1"/></svg></button>}
    </div>)}
   </div>
   <div id={menuId} ref={menu} popover="auto" className="custom-property-popover option-settings-popover">{menuOption&&<OptionSettings key={menuOption.id} definition={d} option={menuOption} archived={disabled} valuePending={pending} onSaved={onDefinition} onDeleted={onOptionDeleted} onPending={setOptionPending}/>}</div>
   {query.trim()&&!d.options.some(o=>o.name.toLocaleLowerCase()===query.trim().toLocaleLowerCase())&&d.options.length<100&&<button className="property-create-option" disabled={busy||disabled||optionPending} onClick={()=>void create()}>{busy?t("创建中…"):t("创建“{title}”",{title:query.trim()})}</button>}
   {!options.length&&!query&&<p className="property-choice-hint">{t("输入名称，创建第一个选项")}</p>}
   {!!selected.length&&<button className="property-clear" disabled={busy||disabled||optionPending} onClick={()=>{onChange(null);panel.current?.hidePopover();}}>{t("清空选择")}</button>}
   {error&&<div role="alert" className="custom-property-invalid">{translateError(error)}</div>}
  </div>
 </div>;
}
