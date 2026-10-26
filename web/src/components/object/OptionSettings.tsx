import {useEffect,useRef,useState} from "react";
import {api,ApiError} from "../../app/api";
import {useAutosave} from "../markdown/useAutosave";
import {PropertyDraftStatus} from "./PropertyDraftStatus";
import {optionColor,propertyColors,type PropertyDefinition,type PropertyOption} from "./propertyTypes";

export async function currentDefinition(d:PropertyDefinition) {
 const result=await api<{definitions:PropertyDefinition[]}>(`/projects/${d.project_id}/property-definitions/${d.object_type}`);
 return result.definitions.find(item=>item.id===d.id);
}
export function OptionSettings({definition:d,option,archived,valuePending,onSaved,onDeleted,onPending}:{definition:PropertyDefinition;option:PropertyOption;archived:boolean;valuePending:boolean;onSaved:(d:PropertyDefinition)=>void;onDeleted:(d:PropertyDefinition|undefined)=>Promise<void>;onPending:(pending:boolean)=>void}) {
 const [epoch,setEpoch]=useState(0);
 const [loaded,setLoaded]=useState<PropertyDefinition|null>(null);
 const current=loaded&&loaded.version>=d.version?loaded:d;
 const selected=current.options.find(o=>o.id===option.id)??option;
 return <OptionEditor key={option.id+":"+epoch} definition={current} option={selected} archived={archived} valuePending={valuePending} onSaved={next=>{setLoaded(next);onSaved(next);}} onDeleted={onDeleted} onPending={onPending} reload={next=>{setLoaded(next);setEpoch(n=>n+1);}}/>;
}
function OptionEditor({definition:d,option,archived,valuePending,onSaved,onDeleted,onPending,reload}:{definition:PropertyDefinition;option:PropertyOption;archived:boolean;valuePending:boolean;onSaved:(d:PropertyDefinition)=>void;onDeleted:(d:PropertyDefinition|undefined)=>Promise<void>;onPending:(pending:boolean)=>void;reload:(d:PropertyDefinition)=>void}) {
 const [deleting,setDeleting]=useState(false),[unresolvedDelete,setUnresolvedDelete]=useState(false),[error,setError]=useState("");
 const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const a=useAutosave({name:option.name,color:optionColor(option.color)},d.version,async(draft,version)=>{
  if(!d.options.some(o=>o.id===option.id))throw new Error("选项已被删除，请重新载入");
  const options=d.options.map(o=>o.id===option.id?{...o,name:draft.name.trim(),color:draft.color}:o);
  try {onSaved(await api<PropertyDefinition>(`/property-definitions/${d.id}`,"PATCH",{version,options}));}
  catch(e){if(e instanceof ApiError&&e.status===409){const current=await currentDefinition(d);const saved=current?.options.find(o=>o.id===option.id);if(current&&current.version===version+1&&saved?.name===draft.name.trim()&&optionColor(saved.color)===draft.color){onSaved(current);return;}}throw e;}
 },archived||deleting||unresolvedDelete,draft=>!!draft.name.trim()&&draft.name.length<=80,`property-option:${d.project_id}:${d.object_type}:${d.id}:${option.id}`);
 useEffect(()=>{onPending(a.dirty||a.busy||deleting||unresolvedDelete);},[a.dirty,a.busy,deleting,unresolvedDelete,onPending]);
 useEffect(()=>()=>onPending(false),[onPending]);
 const remove=async()=>{
  if(archived||valuePending||a.dirty||a.busy||deleting)return;
  if(!confirm(`删除选项“${option.name}”？该类型所有对象（包括回收站）中引用它的值将被移除，无法撤销。`))return;
  onPending(true);setDeleting(true);setError("");
  let applied=false;
  try {
   let next:PropertyDefinition|undefined;
   try {next=await api<PropertyDefinition>(`/property-definitions/${d.id}/options/${option.id}`,"DELETE",{version:a.version});}
   catch(e){let fresh:PropertyDefinition|undefined;try{fresh=await currentDefinition(d);}catch{throw e;}if(fresh?.options.some(o=>o.id===option.id))throw e;next=fresh;}
   applied=true;setUnresolvedDelete(true);await onDeleted(next);
  }catch(e){if(active.current)setError((applied?"选项已删除，同步属性失败：":"")+(e as Error).message);}finally{if(active.current)setDeleting(false);}
 };
 return <section className="option-settings" aria-label="选项设置" data-dirty={a.dirty||a.busy||deleting||unresolvedDelete}>
  <label>选项名称<input aria-label="选项名称" value={a.draft.name} maxLength={80} disabled={archived||deleting||unresolvedDelete} onChange={e=>{setError("");a.setDraft(old=>({...old,name:e.target.value}));}}/></label>
  <div className="option-colors" role="group" aria-label="选项颜色">{propertyColors.map(c=><button key={c.id} className="option-color" data-color={c.id} aria-label={`颜色 ${c.name}`} aria-pressed={a.draft.color===c.id} disabled={archived||deleting||unresolvedDelete} onClick={()=>{setError("");a.setDraft(old=>({...old,color:c.id}));}}><span aria-hidden="true"/>{c.name}</button>)}</div>
  <PropertyDraftStatus noun="选项" state={a} onReload={async discard=>{const fresh=await currentDefinition(d);if(!fresh||!fresh.options.some(o=>o.id===option.id)){await onDeleted(fresh);return;}onSaved(fresh);discard();reload(fresh);}}/>
  {error&&<p role="alert">{error} <button disabled={valuePending||a.dirty||a.busy||deleting} onClick={async()=>{try{const fresh=await currentDefinition(d);if(!fresh||!fresh.options.some(o=>o.id===option.id)){await onDeleted(fresh);return;}onSaved(fresh);a.discardRecovery();reload(fresh);}catch(e){setError((e as Error).message);}}}>重新载入选项</button></p>}
  <button className="property-danger" disabled={archived||valuePending||a.dirty||a.busy||deleting||unresolvedDelete} onClick={()=>void remove()}>{deleting?"删除中…":"删除选项"}</button>
 </section>;
}
