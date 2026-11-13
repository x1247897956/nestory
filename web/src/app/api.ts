import { randomUUID } from "./uuid";
import { getTabOwner } from "./tabIdentity";
import { MAX_DOCUMENT_BYTES, type BodyDocument } from "./document";
export type Project = {
  pinned?: boolean;
  id: string;
  title: string;
  description: string;
  archived_at: number | null;
  version: number;
  created_at: number;
  updated_at: number;
};
export type Task = {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  body_document: BodyDocument;
  stage: string;
  priority: string;
  due_date: string | null;
  position: number;
  version: number;
  created_at: number;
  updated_at: number;
};
// Collections intentionally cannot be passed to an editor as complete documents.
export type TaskProperties = Omit<Task, "body_document">;
export function propertiesOf<T extends object>(value: T): Omit<T, "body_document"> {
  const properties = {...value};
  delete (properties as {body_document?: unknown}).body_document;
  return properties;
}
export const stages = [
  ["todo", "Todo"],
  ["in_plan", "InPlan"],
  ["in_process", "InProcess"],
  ["done", "Done"],
  ["cancelled", "Cancelled"],
] as const;
export const priorities = [
  ["none", "未设置"],
  ["low", "低"],
  ["medium", "中"],
  ["high", "高"],
] as const;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// One durable record per canonical intent avoids overwriting unrelated retries.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return "{" + Object.keys(value).sort().filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => JSON.stringify(k) + ":" + canonical((value as Record<string, unknown>)[k])).join(",") + "}";
  return JSON.stringify(value);
}
function createIntentKey(path: string, body: unknown) {
  const owner = getTabOwner();
  return "noteapp:create:v2:" + owner + ":" + canonical([path, body]);
}
// Recover the original payload after remounting, before generating localized
// defaults. The existing durable intent remains the sole source of identity.
export function recoverCreateInput<T extends object>(path:string,matches:(input:Record<string,unknown>)=>boolean):T|undefined {
 try {
  const prefix="noteapp:create:v2:"+getTabOwner()+":";
  for(let index=0;index<window.localStorage.length;index++){
   const key=window.localStorage.key(index);
   if(!key?.startsWith(prefix)||!window.localStorage.getItem(key))continue;
   let record:unknown;
   try {record=JSON.parse(key.slice(prefix.length));}catch {continue;}
   if(!Array.isArray(record)||record.length!==2||record[0]!==path)continue;
   const input=record[1];
   if(input&&typeof input==='object'&&!Array.isArray(input)&&matches(input))return input as T;
  }
 } catch {throw new Error("无法保存创建请求的恢复信息，请恢复浏览器存储后重试。");}
}
// Only call after the user explicitly abandons a creation; retries must keep the intent.
export function abandonCreateIntent(path: string, body: unknown): void {
  try {
    window.localStorage.removeItem(createIntentKey(path, body));
  } catch {
    throw new Error("无法清理创建请求的恢复信息，请恢复浏览器存储后重试。");
  }
}
function createIntent(path: string, method: string, body: unknown) {
  if (method !== "POST" || !(/^\/projects(?:\/[^/?]+\/(?:tasks|pages|events))?$/.test(path) || /^\/projects\/[^/?]+\/property-definitions\/(?:tasks|pages|events)$/.test(path))) return;
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  try {
    const key = createIntentKey(path, body);
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = randomUUID();
      window.localStorage.setItem(key, id);
    }
    return { key, id, body: { ...body, request_id: id } };
  } catch {
    throw new Error("无法保存创建请求的恢复信息，请恢复浏览器存储后重试。");
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (body && typeof body === "object" && "body_document" in body &&
      new TextEncoder().encode(JSON.stringify(body.body_document)).byteLength > MAX_DOCUMENT_BYTES)
    throw new ApiError(413, "正文超过 2 MiB，请缩减内容或拆分为多篇笔记；草稿未丢弃");
  const intent = createIntent(path, method, body);
  const res = await fetch("/api/v1" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(intent?.body ?? body),
  });
  const data = await res.json();
  if (intent && (res.ok || (res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status)))) {
    try {
      if (window.localStorage.getItem(intent.key) === intent.id) window.localStorage.removeItem(intent.key);
    } catch {
      throw new Error("请求已返回，但无法清理恢复信息；请恢复浏览器存储后重试。");
    }
  }
  if (!res.ok)
    throw new ApiError(res.status, data.error?.message ?? "请求失败");
  return data as T;
}
