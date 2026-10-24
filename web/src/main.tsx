import { initializeTabIdentity } from "./app/tabIdentity";
import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/search", element: <App /> },
  { path: "/trash", element: <App /> },
  { path: "/projects/:projectId", element: <App /> },
  { path: "/projects/:projectId/tasks", element: <App /> },
  { path: "/projects/:projectId/tasks/:taskId", element: <App /> },
  { path: "/projects/:projectId/events", element: <App /> },
  { path: "/projects/:projectId/events/:eventId", element: <App /> },
  { path: "/projects/:projectId/pages", element: <App /> },
  { path: "/projects/:projectId/pages/:pageId", element: <App /> },
]);
// Recovery remains available with an explicit storage error if identity setup fails.
void initializeTabIdentity().catch(() => undefined).then(() => {
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);

});
