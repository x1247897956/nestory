import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";
it("uses source offsets for duplicate tasks and ignores fenced tasks", () => {
  const source = "- [ ] same\n- [ ] same\n\n```\n- [ ] code\n```";
  const change = vi.fn();
  render(<MarkdownPreview value={source} onChange={change} />);
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(2);
  fireEvent.click(boxes[1]);
  expect(change).toHaveBeenCalledWith(
    "- [ ] same\n- [x] same\n\n```\n- [ ] code\n```",
  );
});
it("disables HTML and dangerous protocols", () => {
  const { container } = render(
    <MarkdownPreview
      value={
        "<script>alert(1)</script>\n\n[x](javascript:alert%281%29)\n\n![x](data:image/svg+xml,evil)"
      }
    />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("a")?.getAttribute("href")).not.toMatch(
    /javascript:/,
  );
  expect(container.querySelector("img")).toBeNull();
});
it("highlights fenced code without turning it into tasks", () => {
  const { container } = render(
    <MarkdownPreview value={"```js\nconst answer = 42;\n```"} />,
  );
  expect(container.querySelector("code .hljs-keyword")).toHaveTextContent(
    "const",
  );
});
it("nested child checkbox only updates its own source marker", () => {
  const change = vi.fn();
  render(
    <MarkdownPreview value={"- [ ] parent\n  - [ ] child"} onChange={change} />,
  );
  fireEvent.click(screen.getAllByRole("checkbox")[1]);
  expect(change).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledWith("- [ ] parent\n  - [x] child");
});
