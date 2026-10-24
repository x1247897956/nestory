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
  body: string;
  stage: string;
  priority: string;
  due_date: string | null;
  position: number;
  version: number;
  created_at: number;
  updated_at: number;
};
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
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api/v1" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok)
    throw new ApiError(res.status, data.error?.message ?? "请求失败");
  return data as T;
}
