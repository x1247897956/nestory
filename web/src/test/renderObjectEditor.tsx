import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Editor tests exercise draft persistence; provide the shell context used by object properties.
export function renderObjectEditor(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["config"], { timezone: "Asia/Shanghai" });
  client.setQueryData(["relation-options", "p"], []);
  for (const type of ["tasks", "events"]) for (const id of ["t", "e", "fold"]) client.setQueryData(["relations", type, id], []);
  return render(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);
}
