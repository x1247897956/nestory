import { useEffect, useId, useRef, useState, useLayoutEffect } from "react";
import { api, ApiError } from "../../app/api";
import { useAutosave } from "../editor/useAutosave";
import { PropertyDraftStatus } from "./PropertyDraftStatus";
import { PropertyChoice } from "./PropertyChoice";
import { PropertySettings } from "./PropertySettings";
import { propertyKinds, positionPropertyPopover, validPropertyURL, normalizePropertyValue, type CustomField, type PropertyDefinition, type PropertyValue, type PropertyView } from "./propertyTypes";

export function PropertyField({field,objectId,archived,autoEdit,onDefinition,onValue,onDeleted,refresh}:{field:CustomField;objectId:string;archived:boolean;autoEdit:boolean;onDefinition:(d:PropertyDefinition)=>void;onValue:(field:CustomField)=>void;onDeleted:(id:string)=>void;refresh:(afterOptionDelete?:boolean)=>Promise<unknown>}) {
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
   <button ref={button} className="custom-property-name" title={d.name} aria-label={`设置属性 ${d.name}`} disabled={archived} popoverTarget={popup}
    onClick={()=>{if(!panel.current?.querySelector('[data-dirty="true"], [role="alert"]'))setSettingsEpoch(n=>n+1);setSettingsOpened(true);positionPropertyPopover(panel.current,button.current);}}><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d={propertyKinds.find(x=>x.kind===d.kind)?.icon}/></svg><span>{d.name}</span></button>
   <ValueEditor key={valueEpoch} field={field} objectId={objectId} archived={archived} onValue={onValue} onDefinition={onDefinition}
    onReload={async(discard,afterOptionDelete)=>{await refresh(afterOptionDelete);discard();setValueEpoch(n=>n+1);}}/>
  </div>
  <div id={popup} ref={panel} popover="auto" role="group" aria-label="属性设置" className="custom-property-popover">
   {settingsOpened&&<PropertySettings key={settingsEpoch} definition={d} archived={archived} focusName={autoEdit} onSaved={onDefinition} onDeleted={onDeleted}
    onReload={async discard=>{await refresh();discard();setSettingsEpoch(n=>n+1);}}/>}
  </div>
 </div>;
}
function ValueEditor({field,objectId,archived,onValue,onDefinition,onReload}:{field:CustomField;objectId:string;archived:boolean;onValue:(field:CustomField)=>void;onDefinition:(d:PropertyDefinition)=>void;onReload:(discard:()=>void,afterOptionDelete?:boolean)=>Promise<void>}) {
 const d=field.definition;const [editingURL,setEditingURL]=useState(false);const textArea=useRef<HTMLTextAreaElement>(null);
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
 const value=a.draft.value;
 const update=(next:PropertyValue)=>a.setDraft({value:normalizePropertyValue(d.kind,next)});
 useLayoutEffect(()=>{if(textArea.current){textArea.current.style.height="auto";textArea.current.style.height=Math.min(160,textArea.current.scrollHeight)+"px";}},[value]);
 const invalid=d.kind==="url"&&!validPropertyURL(value);
 return <div className="custom-property-value" data-dirty={a.dirty||a.busy}>
  {d.kind==="text" ? <textarea ref={textArea} aria-label={`属性值 ${d.name}`} rows={1} value={typeof value==="string"?value:""} placeholder="未填写" disabled={archived} onChange={event=>update(event.target.value||null)} maxLength={4000}/>
   : d.kind==="url" ? <div className="property-url-value">
    {editingURL||invalid ? <input autoFocus aria-label={`属性值 ${d.name}`} type="url" value={typeof value==="string"?value:""} placeholder="https://" disabled={archived} onChange={event=>update(event.target.value||null)} onBlur={()=>{if(!invalid)setEditingURL(false);}} onKeyDown={e=>{if(e.key==="Enter"&&!invalid)setEditingURL(false);}} maxLength={2048}/>
    : <>{typeof value==="string"&&value?<a href={value} target="_blank" rel="noopener noreferrer" title={value} aria-label={`打开网址 ${d.name}`}>{value}</a>:<button className="property-value-trigger property-empty" disabled={archived} onClick={()=>setEditingURL(true)}>未填写</button>}
     {!archived&&<button className="property-url-edit" aria-label={`编辑网址 ${d.name}`} onClick={()=>setEditingURL(true)}><svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m13 3 4 4-9 9-5 1 1-5Z M11 5l4 4"/></svg></button>}</>}
    </div>
   : <PropertyChoice definition={d} value={value} disabled={archived} pending={a.dirty||a.busy||!!a.error} onChange={update} onDefinition={onDefinition} onOptionDeleted={async next=>{if(a.dirty||a.busy||a.error)throw new Error("当前属性值尚未保存，请先处理保存提示");if(next)onDefinition(next);await onReload(a.discardRecovery,true);}}/>}

  {invalid&&<small className="custom-property-invalid">请输入完整HTTP或HTTPS网址，当前输入未保存</small>}
  <PropertyDraftStatus state={a} onReload={onReload}/>
 </div>;
}
