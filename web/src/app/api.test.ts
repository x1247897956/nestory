import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { abandonCreateIntent, api } from "./api";
const reply = (ok = true, status = 200) => ({ ok, status, json: async () => ({ id: "created" }) });
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    get length() {return data.size;},
    key: (index:number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}
beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {return data.size;},
    key: (index:number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("persists canonical create retries across module reload and separates later successful creates", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValue(reply());
  vi.stubGlobal("fetch", fetcher);
  await expect(api("/projects/p/tasks", "POST", { title: "x", priority: "low" })).rejects.toThrow();
  const first = JSON.parse(fetcher.mock.calls[0][1].body).request_id;
  vi.resetModules();
  const reloaded = (await import("./api")).api;
  await reloaded("/projects/p/tasks", "POST", { priority: "low", title: "x" });
  expect(JSON.parse(fetcher.mock.calls[1][1].body).request_id).toBe(first);
  await reloaded("/projects/p/tasks", "POST", { title: "x", priority: "low" });
  expect(JSON.parse(fetcher.mock.calls[2][1].body).request_id).not.toBe(first);
});
it("keeps independent failed intents and 5xx retries, but never adds IDs to moves", async () => {
  const fetcher = vi.fn().mockResolvedValue(reply(false, 500));
  vi.stubGlobal("fetch", fetcher);
  for (const title of ["one", "two", "one"]) await api("/projects", "POST", { title }).catch(() => {});
  const bodies = fetcher.mock.calls.map((c) => JSON.parse(c[1].body));
  expect(bodies[0].request_id).toBe(bodies[2].request_id);
  expect(bodies[0].request_id).not.toBe(bodies[1].request_id);
  await api("/tasks/t/move", "POST", { project_id: "p" }).catch(() => {});
  expect(JSON.parse(fetcher.mock.calls[3][1].body).request_id).toBeUndefined();
});
it("blocks creates before sending if durable storage fails", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
  await expect(api("/projects", "POST", { title: "x" })).rejects.toThrow("恢复信息");
  expect(fetcher).not.toHaveBeenCalled(); spy.mockRestore();
});
it("rejects oversized documents before fetching", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(api("/pages/p", "PATCH", { body_document: { text: "a".repeat(2 * 1024 * 1024) } })).rejects.toMatchObject({ status: 413 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("retains the ID when a successful response body is lost or invalid", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 201, json: async () => { throw new Error("truncated JSON"); } }).mockResolvedValue(reply());
  vi.stubGlobal("fetch", fetcher);
  await expect(api("/projects/p/events", "POST", { title: "x" })).rejects.toThrow("truncated JSON");
  await api("/projects/p/events", "POST", { title: "x" });
  expect(JSON.parse(fetcher.mock.calls[1][1].body).request_id).toBe(JSON.parse(fetcher.mock.calls[0][1].body).request_id);
});

it("scopes identical pending creates to each tab while retaining both retries", async () => {
  const firstTab = window.sessionStorage;
  let firstName = window.name;
  const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  await api("/projects", "POST", { title: "x" }).catch(() => {});
  firstName = window.name;
  vi.stubGlobal("sessionStorage", memoryStorage());
  window.name = "";
  await api("/projects", "POST", { title: "x" }).catch(() => {});
  const ids = fetcher.mock.calls.map((call) => JSON.parse(call[1].body).request_id);
  expect(ids[0]).not.toBe(ids[1]);
  vi.stubGlobal("sessionStorage", firstTab);
  window.name = firstName;
  await api("/projects", "POST", { title: "x" }).catch(() => {});
  expect(JSON.parse(fetcher.mock.calls[2][1].body).request_id).toBe(ids[0]);
});
it("abandons only the explicitly cancelled intent in the current tab", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  for (const title of ["one", "two"]) await api("/projects", "POST", { title }).catch(() => {});
  abandonCreateIntent("/projects", { title: "one" });
  for (const title of ["one", "two"]) await api("/projects", "POST", { title }).catch(() => {});
  const ids = fetcher.mock.calls.map((call) => JSON.parse(call[1].body).request_id);
  expect(ids[0]).not.toBe(ids[2]);
  expect(ids[1]).toBe(ids[3]);
});
it("blocks creates when the tab identity cannot be persisted", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => { throw new Error("disabled"); });
  await expect(api("/projects", "POST", { title: "x" })).rejects.toThrow("恢复信息");
  expect(fetcher).not.toHaveBeenCalled();
});

it("recovers only matching durable create input owned by the current tab across reload", async () => {
 const fetcher=vi.fn().mockRejectedValue(new Error('lost response'));vi.stubGlobal('fetch',fetcher);
 const path='/projects/p/pages';
 await api(path,'POST',{title:'无标题笔记',parent_id:null}).catch(()=>{});
 vi.resetModules();const fresh=await import('./api');
 const recovered=fresh.recoverCreateInput<{title:string;parent_id:null}>(path,input=>input.parent_id===null);
 expect(recovered).toEqual({title:'无标题笔记',parent_id:null});
 expect(fresh.recoverCreateInput('/projects/other/pages',()=>true)).toBeUndefined();
 expect(fresh.recoverCreateInput(path,()=>false)).toBeUndefined();
 await fresh.api(path,'POST',recovered).catch(()=>{});
 expect(JSON.parse(fetcher.mock.calls[1][1].body).request_id).toBe(JSON.parse(fetcher.mock.calls[0][1].body).request_id);
 vi.stubGlobal('sessionStorage',memoryStorage());window.name='';
 expect(fresh.recoverCreateInput(path,()=>true)).toBeUndefined();
});
