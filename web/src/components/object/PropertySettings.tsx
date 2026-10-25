import { api, ApiError } from "../../app/api";
import { randomUUID } from "../../app/uuid";
import { useAutosave } from "../markdown/useAutosave";
import { PropertyDraftStatus } from "./PropertyDraftStatus";
import { propertyKinds, type PropertyDefinition, type PropertyOption } from "./propertyTypes";

type Draft={name:string;options:PropertyOption[];pendingOption:string};
export function PropertySettings({definition,archived,onSaved,onReload,focusName}:{definition:PropertyDefinition;archived:boolean;onSaved:(d:PropertyDefinition)=>void;onReload:(discard:()=>void)=>Promise<void>;focusName:boolean}) {
 const d=definition;
 const a=useAutosave<Draft>({name:d.name,options:d.options,pendingOption:""},d.version,async(draft,version)=>{
  const payload={name:draft.name.trim(),...(d.kind.includes("select")?{options:draft.options}:{}),version};
  try {onSaved(await api<PropertyDefinition>(`/property-definitions/${d.id}`,"PATCH",payload));}
  catch(e){
   if(e instanceof ApiError&&e.status===409) {
    const fresh=await api<{definitions:PropertyDefinition[]}>(`/projects/${d.project_id}/property-definitions/${d.object_type}`);
    const current=fresh.definitions.find(x=>x.id===d.id);
    if(current&&current.version===version+1&&current.name===payload.name&&JSON.stringify(current.options)===JSON.stringify(draft.options)){onSaved(current);return;}
   }
   throw e;
  }
 },archived,draft=>!!draft.name.trim()&&draft.name.length<=80&&!draft.pendingOption&&draft.options.every(x=>!!x.name.trim()&&x.name===x.name.trim())&&new Set(draft.options.map(x=>x.name.toLowerCase())).size===draft.options.length,`property-definition:${d.project_id}:${d.object_type}:${d.id}`);
 return <div data-dirty={a.dirty||a.busy}>
  <label>属性名称<input aria-label="属性名称" value={a.draft.name} maxLength={80} disabled={archived} autoFocus={focusName}
    onFocus={event=>{if(focusName)event.target.select();}} onChange={e=>a.setDraft(old=>({...old,name:e.target.value}))}/></label>
  <p className="property-shared-hint">{propertyKinds.find(x=>x.kind===d.kind)?.name} · 此项目所有{d.object_type==="pages"?"笔记":d.object_type==="tasks"?"任务":"日程"}共用</p>
  {d.kind.includes("select")&&<div className="custom-option-settings">
   {a.draft.options.map((option,index)=><input key={option.id} aria-label={`选项名称 ${index+1}`} value={option.name} maxLength={80} disabled={archived}
     onChange={event=>a.setDraft(old=>({...old,options:old.options.map(x=>x.id===option.id?{...x,name:event.target.value}:x)}))} onBlur={()=>a.setDraft(old=>({...old,options:old.options.map(x=>({...x,name:x.name.trim()}))}))}/>)}
   <div className="custom-option-add"><input aria-label="新选项名称" placeholder="新选项" maxLength={80} value={a.draft.pendingOption} disabled={archived||a.draft.options.length>=100}
    onChange={e=>a.setDraft(old=>({...old,pendingOption:e.target.value}))}
    onKeyDown={event=>{if(event.key==="Enter"&&a.draft.pendingOption.trim()&&a.draft.options.length<100){event.preventDefault();a.setDraft(old=>({...old,options:[...old.options,{id:randomUUID(),name:old.pendingOption.trim()}],pendingOption:""}));}}}/>
    <button disabled={archived||!a.draft.pendingOption.trim()||a.draft.options.length>=100} onClick={()=>a.setDraft(old=>({...old,options:[...old.options,{id:randomUUID(),name:old.pendingOption.trim()}],pendingOption:""}))}>添加选项</button></div>
  </div>}
  <PropertyDraftStatus state={a} onReload={onReload}/>
 </div>;
}
