import {useRef,useState} from "react";
import {api,ApiError} from "../../app/api";
import {useAutosave} from "../editor/useAutosave";
import {PropertyDraftStatus} from "./PropertyDraftStatus";
import {currentDefinition} from "./OptionSettings";
import type {PropertyDefinition,PropertyOption} from "./propertyTypes";

type Draft={name:string;options:PropertyOption[];pendingOption:string};
export function PropertySettings({definition:d,archived,onSaved,onReload,onDeleted,focusName}:{definition:PropertyDefinition;archived:boolean;onSaved:(d:PropertyDefinition)=>void;onReload:(discard:()=>void)=>Promise<void>;onDeleted:(id:string)=>void;focusName:boolean}) {
 const originalOptions=useRef(JSON.stringify(d.options));
 const [deleting,setDeleting]=useState(false),[error,setError]=useState("");
 // Keep the previous draft shape/key so existing local recovery records remain visible.
 const a=useAutosave<Draft>({name:d.name,options:d.options,pendingOption:""},d.version,async(draft,version)=>{
  if(draft.pendingOption||JSON.stringify(draft.options)!==originalOptions.current)throw new Error("有旧版选项草稿，请先复制输入后重新载入；选项现在由各自的三点菜单管理");
  try {onSaved(await api<PropertyDefinition>(`/property-definitions/${d.id}`,"PATCH",{name:draft.name.trim(),version}));}
  catch(e){if(e instanceof ApiError&&e.status===409){const current=await currentDefinition(d);if(current&&current.version===version+1&&current.name===draft.name.trim()){onSaved(current);return;}}throw e;}
 },archived||deleting,draft=>!!draft.name.trim()&&draft.name.length<=80,`property-definition:${d.project_id}:${d.object_type}:${d.id}`);
 const remove=async()=>{
  if(archived||a.dirty||a.busy||deleting)return;
  if(!confirm(`删除属性“${d.name}”？当前项目该类型所有对象（包括回收站）上的这个属性及其值将永久删除，无法撤销。`))return;
  setDeleting(true);setError("");
  try {
   try {await api(`/property-definitions/${d.id}`,"DELETE",{version:a.version});}
   catch(e){let exists;try{exists=await currentDefinition(d);}catch{throw e;}if(exists)throw e;}
   a.discardRecovery();onDeleted(d.id);
  }catch(e){setError((e as Error).message);setDeleting(false);}
 };
 return <div data-dirty={a.dirty||a.busy||deleting}>
  <div className="property-settings-caption">编辑属性</div>
  <label>名称<input aria-label="属性名称" value={a.draft.name} maxLength={80} disabled={archived||deleting} autoFocus={focusName} onFocus={e=>{if(focusName)e.target.select();}} onChange={e=>{setError("");a.setDraft(old=>({...old,name:e.target.value}));}}/></label>
  <PropertyDraftStatus state={a} onReload={onReload}/>
  {error&&<p role="alert">{error} <button disabled={a.dirty||a.busy||deleting} onClick={()=>void onReload(a.discardRecovery).catch(e=>setError((e as Error).message))}>重新载入属性</button></p>}
  <button className="property-danger" disabled={archived||a.dirty||a.busy||deleting} onClick={()=>void remove()}>{deleting?"删除中…":"删除属性"}</button>
 </div>;
}
