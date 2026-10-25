import { Children, isValidElement, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../app/api";
import { Relations } from "../../features/relation/Relations";

type Definition = { type: string; name: string; properties: { key: string; label: string; kind: string; default: unknown; mutation: string }[] };
type ObjectView = { read_only: boolean; properties: Record<string, unknown> };

export function ObjectProperties({ projectId, type, id, version, archived, children }: {
  projectId: string; type: "tasks" | "pages" | "events"; id: string; version: number; archived: boolean; children?: ReactNode;
}) {
  const schema = useQuery({ queryKey: ["object-type", type], queryFn: () => api<Definition>(`/object-types/${type}`), staleTime: Infinity });
  const object = useQuery({ queryKey: ["object", type, id, version, archived], queryFn: () => api<ObjectView>(`/objects/${type}/${id}`) });
  const fields = new Map(Children.toArray(children).filter(isValidElement).map(child => [(child.props as Record<string, unknown>)["data-property"], child]));
  const readonly = archived || !!object.data?.read_only;
  return <section className="object-property-section" aria-label="对象属性栏">
    {(schema.isError || object.isError) && <p className="property-error" role="alert">属性刷新失败，当前编辑内容仍保留。<button onClick={() => { void schema.refetch(); void object.refetch(); }}>重试</button></p>}
    <div className="object-properties task-properties" role="group" aria-label="对象属性">
      {schema.data ? schema.data.properties.filter(property => type !== "pages" || property.key === "relations").map(property => property.kind === "relations" ? <div className="object-property-cell" key={property.key} data-property={property.key}><Relations key={type + id} projectId={projectId} type={type} id={id} archived={readonly}/></div> : <div className="object-property-cell" key={property.key} data-property={property.key}><span className="object-property-label">{property.label}</span>{fields.get(property.key) ?? <span className="object-property-value">{object.isPending ? "加载中…" : object.data?.properties[property.key] == null ? "未设置" : String(object.data.properties[property.key])}</span>}</div>) : <>{schema.isPending && <span role="status">正在加载属性定义…</span>}{children}</>}
    </div>
  </section>;
}
