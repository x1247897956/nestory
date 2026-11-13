import {useI18n,translateError} from "../../i18n";
import { useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, recoverCreateInput } from "../../app/api";
import { PropertyField } from "./PropertyField";
import { positionPropertyPopover, propertyKinds, newPropertyInput, type CustomField, type PropertyDefinition, type PropertyKind, type PropertyView } from "./propertyTypes";
import "./properties.css";

export function CustomProperties({projectId,type,id,archived}:{projectId:string;type:"tasks"|"pages"|"events";id:string;archived:boolean}) {
 const {t}=useI18n();
 const qc=useQueryClient();const key=["custom-properties",projectId,type,id];
 const query=useQuery({queryKey:key,queryFn:()=>api<PropertyView>(`/objects/${type}/${id}/custom-properties`)});
 const [creating,setCreating]=useState(false),[created,setCreated]=useState(""),[error,setError]=useState("");
 const [retryInput,setRetryInput]=useState<{kind:PropertyKind;name?:string}|{source_id:string;source_version:number}|null>(null);
 const [pickerOpened,setPickerOpened]=useState(false);
 const catalog=useQuery({queryKey:["property-catalog",projectId],enabled:pickerOpened,queryFn:async()=>{
  const lists=await Promise.all((["tasks","pages","events"] as const).map(t=>api<{definitions:PropertyDefinition[]}>(`/projects/${projectId}/property-definitions/${t}`)));
  return lists.flatMap(x=>x.definitions);
 }});
 const reusable=(catalog.data??[]).filter(d=>d.object_type!==type&&!query.data?.fields.some(f=>f.definition.name.toLocaleLowerCase()===d.name.toLocaleLowerCase()));
 const typeName=(type:string)=>type==="tasks"?t("任务"):type==="pages"?t("笔记"):t("日程");
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
 const create=async(input:{kind:PropertyKind;name?:string}|{source_id:string;source_version:number})=>{
  if(pending.current||readonly)return;
  pending.current=true;setCreating(true);setError("");
  try {
   const path=`/projects/${projectId}/property-definitions/${type}`;
   if("kind" in input){
    const kind=input.kind;
    // A lost response may already have created this definition. Reuse the exact
    // durable intent even if a refresh or language change suggests a new name.
    input=recoverCreateInput<{kind:PropertyKind;name?:string}>(path,candidate=>
     candidate.kind===kind&&Object.keys(candidate).every(key=>key==="kind"||key==="name")&&
     (candidate.name===undefined||typeof candidate.name==="string"),
    )??input;
   }
   setRetryInput(input);
   const definition=await api<PropertyDefinition>(path,"POST",input);
   setCreated(definition.id);
   await qc.invalidateQueries({queryKey:["custom-properties",projectId,type]});
   await qc.invalidateQueries({queryKey:["object"]});
   panel.current?.hidePopover();setRetryInput(null);
  }catch(e){
   setError((e as Error).message);
   if(e instanceof ApiError&&e.status===409){
    if("kind" in input&&e.message==="同类型已有此名称的属性"){
     // This request definitively failed, so its durable intent is retired by
     // api(). Refresh names before a separate, user-initiated creation.
     setRetryInput(null);await query.refetch();
    }else if("source_id" in input){setRetryInput(null);void catalog.refetch();void query.refetch();}
   }
  }
  finally{pending.current=false;setCreating(false);}
 };
 return <section className="custom-properties" aria-label={t("自定义属性")} data-dirty={creating}>
  {query.isPending&&<span className="custom-properties-loading">{t("正在加载自定义属性…")}</span>}
  {query.isError&&<p role="alert">{t("自定义属性加载失败，当前输入仍保留。")}<button onClick={()=>void query.refetch()}>{t("重试加载属性")}</button></p>}
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
   <button ref={trigger} className="add-property" aria-label={t("添加属性")} disabled={creating||query.data!.fields.length>=64} popoverTarget={popup}
    onClick={()=>{setPickerOpened(true);void catalog.refetch();positionPropertyPopover(panel.current,trigger.current);}}>{creating?t("正在添加…"):t("＋ 添加属性")}</button>
   <div ref={panel} id={popup} popover="auto" className="custom-property-popover property-type-picker" role="group" aria-label={t("选择属性类型")}>
    <p className="property-picker-heading">{t("新建属性")}</p>
    {propertyKinds.map(item=><button key={item.kind} disabled={creating} onClick={()=>void create(newPropertyInput(item.kind,query.data?.fields.map(field=>field.definition.name)??[]))}>
     <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon}/></svg>{t(item.name)}
    </button>)}
    <div className="property-reuse-list"><p className="property-picker-heading">{t("复用同项目属性")}</p>
     {catalog.isPending&&<p role="status">{t("正在加载…")}</p>}
     {catalog.isError&&<p role="alert">{t("加载失败")} <button onClick={()=>void catalog.refetch()}>{t("重试")}</button></p>}
     {reusable.map(d=><button key={d.id} aria-label={t("复用 {title}（{type}）",{title:d.name,type:typeName(d.object_type)})} disabled={creating} onClick={()=>void create({source_id:d.id,source_version:d.version})}><span>{d.name}</span><small>{typeName(d.object_type)} · {t(propertyKinds.find(k=>k.kind===d.kind)?.name??d.kind)}</small></button>)}
     {!catalog.isPending&&!catalog.isError&&!reusable.length&&<p className="property-choice-hint">{t("暂无可复用属性")}</p>}
    </div>
   </div>
  </>}
  {error&&<p role="alert">{translateError(error)}{retryInput&&<button disabled={creating} onClick={()=>void create(retryInput)}>{t("重试添加属性")}</button>}</p>}
 </section>;
}
