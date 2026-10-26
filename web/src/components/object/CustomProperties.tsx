import { useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../app/api";
import { PropertyField } from "./PropertyField";
import { positionPropertyPopover, propertyKinds, type CustomField, type PropertyDefinition, type PropertyKind, type PropertyView } from "./propertyTypes";
import "./properties.css";

export function CustomProperties({projectId,type,id,archived}:{projectId:string;type:"tasks"|"pages"|"events";id:string;archived:boolean}) {
 const qc=useQueryClient();const key=["custom-properties",projectId,type,id];
 const query=useQuery({queryKey:key,queryFn:()=>api<PropertyView>(`/objects/${type}/${id}/custom-properties`)});
 const [creating,setCreating]=useState(false),[created,setCreated]=useState(""),[error,setError]=useState("");
 const [retryInput,setRetryInput]=useState<{kind:PropertyKind}|{source_id:string;source_version:number}|null>(null);
 const [pickerOpened,setPickerOpened]=useState(false);
 const catalog=useQuery({queryKey:["property-catalog",projectId],enabled:pickerOpened,queryFn:async()=>{
  const lists=await Promise.all((["tasks","pages","events"] as const).map(t=>api<{definitions:PropertyDefinition[]}>(`/projects/${projectId}/property-definitions/${t}`)));
  return lists.flatMap(x=>x.definitions);
 }});
 const reusable=(catalog.data??[]).filter(d=>d.object_type!==type&&!query.data?.fields.some(f=>f.definition.name.toLocaleLowerCase()===d.name.toLocaleLowerCase()));
 const typeName=(t:string)=>t==="tasks"?"任务":t==="pages"?"笔记":"日程";
 const panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),pending=useRef(false);const popup=useId();
 const readonly=archived||!!query.data?.read_only;
 const definitionSaved=(d:PropertyDefinition)=>{
  qc.setQueriesData<PropertyView>({queryKey:["custom-properties",projectId,type]},old=>old?{...old,fields:old.fields.map(f=>f.definition.id===d.id?{...f,definition:d}:f)}:old);
  void qc.invalidateQueries({queryKey:["object"]});
 };
 const definitionDeleted=(id:string)=>{
  qc.setQueriesData<PropertyView>({queryKey:["custom-properties",projectId,type]},old=>old?{...old,fields:old.fields.filter(f=>f.definition.id!==id)}:old);
  void qc.invalidateQueries({queryKey:["property-catalog",projectId]});void qc.invalidateQueries({queryKey:["object"]});
 };
 const valueSaved=(field:CustomField)=>{
  qc.setQueryData<PropertyView>(key,old=>old?{...old,fields:old.fields.map(f=>f.definition.id===field.definition.id?field:f)}:old);
  void qc.invalidateQueries({queryKey:["object"]});
 };
 const create=async(input:{kind:PropertyKind}|{source_id:string;source_version:number})=>{
  if(pending.current||readonly)return;
  pending.current=true;setCreating(true);setError("");setRetryInput(input);
  try {
   const definition=await api<PropertyDefinition>(`/projects/${projectId}/property-definitions/${type}`,"POST",input);
   setCreated(definition.id);
   await qc.invalidateQueries({queryKey:["custom-properties",projectId,type]});
   await qc.invalidateQueries({queryKey:["object"]});
   panel.current?.hidePopover();setRetryInput(null);
  }catch(e){setError((e as Error).message);if(e instanceof ApiError&&e.status===409&&"source_id" in input){setRetryInput(null);void catalog.refetch();void query.refetch();}}
  finally{pending.current=false;setCreating(false);}
 };
 return <section className="custom-properties" aria-label="自定义属性" data-dirty={creating}>
  {query.isPending&&<span className="custom-properties-loading">正在加载自定义属性…</span>}
  {query.isError&&<p role="alert">自定义属性加载失败，当前输入仍保留。<button onClick={()=>void query.refetch()}>重试加载属性</button></p>}
  <div className="custom-properties-fields">
   {query.data?.fields.map(field=><PropertyField key={field.definition.id} field={field} objectId={id} archived={readonly}
    autoEdit={created===field.definition.id} onDefinition={definitionSaved} onValue={valueSaved} onDeleted={definitionDeleted} refresh={afterOptionDelete=>{
     // Deleted options also change other objects' values. Reopen inactive objects
     // from a fresh snapshot without disturbing active editors or local drafts.
     if(afterOptionDelete)qc.removeQueries({queryKey:["custom-properties",projectId,type],type:"inactive"});
     return query.refetch({throwOnError:true});
    }}/>) }
  </div>
  {!readonly&&!query.isPending&&!query.isError&&<>
   <button ref={trigger} className="add-property" aria-label="添加属性" disabled={creating||query.data!.fields.length>=64} popoverTarget={popup}
    onClick={()=>{setPickerOpened(true);void catalog.refetch();positionPropertyPopover(panel.current,trigger.current);}}>{creating?"正在添加…":"＋ 添加属性"}</button>
   <div ref={panel} id={popup} popover="auto" className="custom-property-popover property-type-picker" role="group" aria-label="选择属性类型">
    <p className="property-picker-heading">新建属性</p>
    {propertyKinds.map(item=><button key={item.kind} disabled={creating} onClick={()=>void create({kind:item.kind})}>
     <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon}/></svg>{item.name}
    </button>)}
    <div className="property-reuse-list"><p className="property-picker-heading">复用同项目属性</p>
     {catalog.isPending&&<p role="status">正在加载…</p>}
     {catalog.isError&&<p role="alert">加载失败 <button onClick={()=>void catalog.refetch()}>重试</button></p>}
     {reusable.map(d=><button key={d.id} aria-label={`复用 ${d.name}（${typeName(d.object_type)}）`} disabled={creating} onClick={()=>void create({source_id:d.id,source_version:d.version})}><span>{d.name}</span><small>{typeName(d.object_type)} · {propertyKinds.find(k=>k.kind===d.kind)?.name}</small></button>)}
     {!catalog.isPending&&!catalog.isError&&!reusable.length&&<p className="property-choice-hint">暂无可复用属性</p>}
    </div>
   </div>
  </>}
  {error&&<p role="alert">{error}{retryInput&&<button disabled={creating} onClick={()=>void create(retryInput)}>重试添加属性</button>}</p>}
 </section>;
}
