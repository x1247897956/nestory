import { useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../app/api";
import { PropertyField } from "./PropertyField";
import { positionPropertyPopover, propertyKinds, type CustomField, type PropertyDefinition, type PropertyKind, type PropertyView } from "./propertyTypes";
import "./properties.css";

export function CustomProperties({projectId,type,id,archived}:{projectId:string;type:"tasks"|"pages"|"events";id:string;archived:boolean}) {
 const qc=useQueryClient();const key=["custom-properties",projectId,type,id];
 const query=useQuery({queryKey:key,queryFn:()=>api<PropertyView>(`/objects/${type}/${id}/custom-properties`)});
 const [creating,setCreating]=useState(false),[created,setCreated]=useState(""),[error,setError]=useState("");
 const [retryKind,setRetryKind]=useState<PropertyKind|null>(null);
 const panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),pending=useRef(false);const popup=useId();
 const readonly=archived||!!query.data?.read_only;
 const definitionSaved=(d:PropertyDefinition)=>{
  qc.setQueriesData<PropertyView>({queryKey:["custom-properties",projectId,type]},old=>old?{...old,fields:old.fields.map(f=>f.definition.id===d.id?{...f,definition:d}:f)}:old);
  void qc.invalidateQueries({queryKey:["object"]});
 };
 const valueSaved=(field:CustomField)=>{
  qc.setQueryData<PropertyView>(key,old=>old?{...old,fields:old.fields.map(f=>f.definition.id===field.definition.id?field:f)}:old);
  void qc.invalidateQueries({queryKey:["object"]});
 };
 const create=async(kind:PropertyKind)=>{
  if(pending.current||readonly)return;
  pending.current=true;setCreating(true);setError("");setRetryKind(kind);
  try {
   const definition=await api<PropertyDefinition>(`/projects/${projectId}/property-definitions/${type}`,"POST",{kind});
   setCreated(definition.id);
   await qc.invalidateQueries({queryKey:["custom-properties",projectId,type]});
   await qc.invalidateQueries({queryKey:["object"]});
   panel.current?.hidePopover();setRetryKind(null);
  }catch(e){setError((e as Error).message);}
  finally{pending.current=false;setCreating(false);}
 };
 return <section className="custom-properties" aria-label="自定义属性" data-dirty={creating}>
  {query.isPending&&<span className="custom-properties-loading">正在加载自定义属性…</span>}
  {query.isError&&<p role="alert">自定义属性加载失败，当前输入仍保留。<button onClick={()=>void query.refetch()}>重试加载属性</button></p>}
  <div className="custom-properties-fields">
   {query.data?.fields.map(field=><PropertyField key={field.definition.id} field={field} objectId={id} archived={readonly}
    autoEdit={created===field.definition.id} onDefinition={definitionSaved} onValue={valueSaved} refresh={()=>query.refetch({throwOnError:true})}/>) }
  </div>
  {!readonly&&!query.isPending&&!query.isError&&<>
   <button ref={trigger} className="add-property" aria-label="添加属性" disabled={creating||query.data!.fields.length>=64} popoverTarget={popup}
    onClick={()=>positionPropertyPopover(panel.current,trigger.current)}>{creating?"正在添加…":"＋ 添加属性"}</button>
   <div ref={panel} id={popup} popover="auto" className="custom-property-popover property-type-picker" role="group" aria-label="选择属性类型">
    {propertyKinds.map(item=><button key={item.kind} disabled={creating} onClick={()=>void create(item.kind)}>
     <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon}/></svg>{item.name}
    </button>)}
   </div>
  </>}
  {error&&<p role="alert">{error}{retryKind&&<button disabled={creating} onClick={()=>void create(retryKind)}>重试添加属性</button>}</p>}
 </section>;
}
