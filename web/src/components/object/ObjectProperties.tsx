import { positionPropertyPopover } from "./propertyTypes";
import { PropertyIcon } from "./PropertyIcon";
import { CustomProperties } from "./CustomProperties";
import { Children, isValidElement, useId, useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../app/api";
import { Relations } from "../../features/relation/Relations";

// Keep disclosure state across editor rebuilds in this tab; a reload starts folded.
const expandedObjects=new Map<string,boolean>();

type Definition = { type: string; name: string; properties: { key: string; label: string; kind: string; default: unknown; mutation: string }[] };
type ObjectView = { read_only: boolean; properties: Record<string, unknown> };

export function ObjectProperties({ projectId, type, id, version, archived, children }: {
  projectId: string; type: "tasks" | "pages" | "events"; id: string; version: number; archived: boolean; children?: ReactNode;
}) {
  const disclosureKey=`${projectId}:${type}:${id}`;
  const [expanded,setExpanded]=useState(()=>expandedObjects.get(disclosureKey)??false);
  useEffect(()=>{expandedObjects.set(disclosureKey,expanded);},[disclosureKey,expanded]);
  const contentId=useId();
  const content=useRef<HTMLDivElement>(null);
  useEffect(()=>{
   const root=content.current;if(!root)return;
   const revealErrors=()=>{
    const error=root.querySelector('[role="alert"]');if(!error)return;
    setExpanded(true);
    // A failed in-flight save may arrive after the user folded the section.
    // Reveal its actual recovery controls, including those inside a closed popover.
    requestAnimationFrame(()=>{
     if(!root.isConnected||!error.isConnected)return;
     let details=error.closest<HTMLDetailsElement>('details');
     while(details&&root.contains(details)){details.open=true;details=details.parentElement?.closest<HTMLDetailsElement>('details')??null;}
     const panels:HTMLElement[]=[];
     let panel=error.closest<HTMLElement>('[popover]');
     while(panel&&root.contains(panel)){panels.unshift(panel);panel=panel.parentElement?.closest<HTMLElement>('[popover]')??null;}
     for(const item of panels){if(item.matches(':popover-open'))continue;
      const trigger=Array.from(root.querySelectorAll<HTMLButtonElement>('button[popovertarget]')).find(b=>b.getAttribute('popovertarget')===item.id);
      positionPropertyPopover(item,trigger??null);item.showPopover();
     }
    });
   };
   const observer=new MutationObserver(revealErrors);observer.observe(root,{childList:true,subtree:true});revealErrors();return()=>observer.disconnect();
  },[]);
  const toggleProperties=()=>{if(expanded){content.current?.querySelectorAll<HTMLElement>(":popover-open").forEach(el=>el.hidePopover());content.current?.querySelectorAll("details").forEach(el=>el.open=false);}setExpanded(v=>!v);};
  const schema = useQuery({ queryKey: ["object-type", type], queryFn: () => api<Definition>(`/object-types/${type}`), staleTime: Infinity });
  const object = useQuery({ queryKey: ["object", type, id, version, archived], queryFn: () => api<ObjectView>(`/objects/${type}/${id}`) });
  const fields = new Map(Children.toArray(children).filter(isValidElement).map(child => [(child.props as Record<string, unknown>)["data-property"], child]));
  const readonly = archived || !!object.data?.read_only;
  return <section className="object-property-section" aria-label="对象属性栏">
    <button className="property-disclosure" aria-expanded={expanded} aria-controls={contentId} onClick={toggleProperties}><svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={expanded?"m5 12 5-5 5 5":"m5 8 5 5 5-5"}/></svg>{expanded?"收起属性":"展开属性"}</button>
    <div ref={content} id={contentId} hidden={!expanded} className="property-layout">
    {(schema.isError || object.isError) && <p className="property-error" role="alert">属性刷新失败，当前编辑内容仍保留。<button onClick={() => { void schema.refetch(); void object.refetch(); }}>重试</button></p>}
    <div className="object-properties task-properties" role="group" aria-label="对象属性">
      {schema.data ? schema.data.properties.filter(property => type !== "pages" || property.key === "relations").map(property => property.kind === "relations" ? <div className="object-property-cell" key={property.key} data-property={property.key}><Relations key={type + id} projectId={projectId} type={type} id={id} archived={readonly}/></div> : <div className="object-property-cell" key={property.key} data-property={property.key}><span className="object-property-label"><PropertyIcon name={property.key}/>{property.label}</span>{fields.get(property.key) ?? <span className="object-property-value">{object.isPending ? "加载中…" : object.data?.properties[property.key] == null ? "未设置" : String(object.data.properties[property.key])}</span>}</div>) : <>{schema.isPending && <span role="status">正在加载属性定义…</span>}{children}</>}
    </div>
    <CustomProperties key={type+id} projectId={projectId} type={type} id={id} archived={readonly}/>
    </div>
  </section>;
}
