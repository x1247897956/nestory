import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Editor tests exercise draft persistence; provide the shell context used by object properties.
export function renderObjectEditor(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["config"], { timezone: "Asia/Shanghai" });
  client.setQueryData(["relation-options", "p"], []);
  client.setQueryData(["object-type", "tasks"], {type:"tasks", properties:[{key:"stage",label:"阶段"},{key:"priority",label:"优先级"},{key:"due_date",label:"截止日期"},{key:"parent_id",label:"父任务"},{key:"relations",label:"关联对象",kind:"relations"}]});
  client.setQueryData(["object-type", "events"], {type:"events", properties:[{key:"start_at",label:"开始时间"},{key:"end_at",label:"结束时间"},{key:"relations",label:"关联对象",kind:"relations"}]});
  for (const type of ["tasks", "events"]) for (const id of ["t", "e", "fold"]) for (const archived of [false,true]) client.setQueryData(["object", type, id, 1, archived], {read_only:archived,properties:{}});
  for (const type of ["tasks", "events"]) for (const id of ["t", "e", "fold"]) client.setQueryData(["relations", type, id], []);
  for (const type of ["tasks", "events"]) for (const id of ["t", "e", "fold"]) client.setQueryData(["custom-properties", "p", type, id], {fields:[],read_only:false});
  return render(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);
}
