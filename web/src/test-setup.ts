import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(() => {
  cleanup();
  window.name = "";
  window.localStorage?.clear?.();
  window.sessionStorage?.clear?.();
});
