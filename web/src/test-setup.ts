import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(() => {
  cleanup();
  window.name = "";
  window.localStorage?.clear?.();
  window.sessionStorage?.clear?.();
});

// jsdom does not implement native dialog methods; real modal/focus behavior is
// covered by Playwright. Unit editor tests need the open/closed DOM lifecycle.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
}
