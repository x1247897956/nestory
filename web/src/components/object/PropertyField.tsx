import { useEffect, useId, useRef, useState, useLayoutEffect } from "react";
import { api, ApiError } from "../../app/api";
import { useAutosave } from "../markdown/useAutosave";
import { PropertyDraftStatus } from "./PropertyDraftStatus";
import { PropertySettings } from "./PropertySettings";
import { positionPropertyPopover, validPropertyURL, normalizePropertyValue, type CustomField, type PropertyDefinition, type PropertyValue, type PropertyView } from "./propertyTypes";

export function PropertyField({field,objectId,archived,autoEdit,onDefinition,onValue,refresh}:{field:CustomField;objectId:string;archived:boolean;autoEdit:boolean;onDefinition:(d:PropertyDefinition)=>void;onValue:(field:CustomField)=>void;refresh:()=>Promise<unknown>}) {
 const [settingsEpoch,setSettingsEpoch]=useState(0);
 const [settingsOpened,setSettingsOpened]=useState(autoEdit);
 const [valueEpoch,setValueEpoch]=useState(0);
 const panel=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);const popup=useId();
 useEffect(()=>{
  if(autoEdit&&!archived&&panel.current&&button.current){setSettingsOpened(true);positionPropertyPopover(panel.current,button.current);panel.current.showPopover();panel.current.querySelector('input')?.focus();}
 },[autoEdit,archived]);
 const d=field.definition;
 return <div className="custom-property" role="group" aria-label={`自定义属性 ${d.name}`} data-custom-property={d.id}>
  <div className="custom-property-entry">
   <button ref={button} className="custom-property-name" aria-label={`设置属性 ${d.name}`} disabled={archived} popoverTarget={popup}
    onClick={()=>{setSettingsOpened(true);positionPropertyPopover(panel.current,button.current);}}>{d.name}</button>
   <ValueEditor key={valueEpoch} field={field} objectId={objectId} archived={archived} onValue={onValue}
    onReload={async discard=>{await refresh();discard();setValueEpoch(n=>n+1);}}/>
  </div>
  <div id={popup} ref={panel} popover="auto" role="group" aria-label="属性设置" className="custom-property-popover">
   {settingsOpened&&<PropertySettings key={settingsEpoch} definition={d} archived={archived} focusName={autoEdit} onSaved={onDefinition}
    onReload={async discard=>{await refresh();discard();setSettingsEpoch(n=>n+1);}}/>}
  </div>
 </div>;
}
function ValueEditor({field,objectId,archived,onValue,onReload}:{field:CustomField;objectId:string;archived:boolean;onValue:(field:CustomField)=>void;onReload:(discard:()=>void)=>Promise<void>}) {
 const d=field.definition;const [open,setOpen]=useState(false);const textArea=useRef<HTMLTextAreaElement>(null);
 const a=useAutosave<{value:PropertyValue}>({value:field.value},field.version,async(draft,version)=>{
  const path=`/objects/${d.object_type}/${objectId}/custom-properties/${d.id}`;
  try {onValue(await api<CustomField>(path,"PUT",{version,definition_version:d.version,value:draft.value}));}
  catch(e){
   if(e instanceof ApiError&&e.status===409){
    const fresh=await api<PropertyView>(`/objects/${d.object_type}/${objectId}/custom-properties`);
    const current=fresh.fields.find(x=>x.definition.id===d.id);
    if(current&&current.version===version+1&&JSON.stringify(current.value)===JSON.stringify(draft.value)){onValue(current);return;}
    // Definitions cannot change type or remove option IDs. Refreshing only the
    // definition is safe while the value CAS version is still unchanged.
    if(current&&current.version===version&&current.definition.version!==d.version){
     onValue(await api<CustomField>(path,"PUT",{version,definition_version:current.definition.version,value:draft.value}));return;
    }
   }
   throw e;
  }
 },archived,draft=>d.kind!=="url"||validPropertyURL(draft.value),`property-value:${d.project_id}:${d.object_type}:${objectId}:${d.id}`);
 const value=a.draft.value;const selected=Array.isArray(value)?value:[];
 const update=(next:PropertyValue)=>a.setDraft({value:normalizePropertyValue(d.kind,next)});
 useLayoutEffect(()=>{if(textArea.current){textArea.current.style.height="auto";textArea.current.style.height=Math.min(160,textArea.current.scrollHeight)+"px";}},[value]);
 const invalid=d.kind==="url"&&!validPropertyURL(value);
 return <div className="custom-property-value" data-dirty={a.dirty||a.busy}>
  {d.kind==="text"||d.kind==="url" ? <div className="custom-text-value">{d.kind==="text" ? <textarea ref={textArea} aria-label={`属性值 ${d.name}`} rows={1} value={typeof value==="string"?value:""} placeholder="未填写" disabled={archived} onChange={event=>update(event.target.value||null)} maxLength={4000}/> : <input aria-label={`属性值 ${d.name}`} type="url" value={typeof value==="string"?value:""} placeholder="未填写" disabled={archived}
   onChange={event=>update(event.target.value||null)} maxLength={2048}/>}
   {d.kind==="url"&&value&&!invalid&&typeof value==="string"&&<a href={value} target="_blank" rel="noopener noreferrer" aria-label={`打开网址 ${d.name}`}>打开</a>}</div>
   : d.kind==="single_select" ? <select aria-label={`属性值 ${d.name}`} value={typeof value==="string"?value:""} disabled={archived}
      onChange={event=>update(event.target.value||null)}><option value="">未选择</option>{d.options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
   : <details className="custom-multiselect" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
      <summary aria-label={`属性值 ${d.name}`}>{selected.length?d.options.filter(o=>selected.includes(o.id)).map(o=>o.name).join("、"):"未选择"}</summary>
      <div className="custom-multiselect-options">{!d.options.length&&<span>请在属性设置中添加选项</span>}{d.options.map(o=><label key={o.id}><input type="checkbox" aria-label={o.name} checked={selected.includes(o.id)} disabled={archived}
       onChange={event=>update(event.target.checked?[...selected,o.id]:selected.filter(id=>id!==o.id))}/>{o.name}</label>)}</div>
     </details>}
  {invalid&&<small className="custom-property-invalid">请输入完整HTTP或HTTPS网址，当前输入未保存</small>}
  <PropertyDraftStatus state={a} onReload={onReload}/>
 </div>;
}
