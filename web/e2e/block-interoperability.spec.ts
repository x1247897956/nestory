import { test, expect } from "@playwright/test";
import { importMarkdown } from "./editor-helpers";
import { readFile } from "node:fs/promises";
test("Markdown import/export preserves tables, nested blocks, code and uploaded images", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/v1/projects", {
      data: { title: "格式互通 " + Date.now() },
    })
  ).json();
  const n = await (
    await request.post(`/api/v1/projects/${p.id}/pages`, {
      data: { title: "格式笔记" },
    })
  ).json();
  await page.goto(`/projects/${p.id}/pages/${n.id}`);
  await importMarkdown(
    page,
    '# 文档\n\n| 字段 | 值 |\n| --- | --- |\n| 甲 | 中文 |\n\n> 引用\n\n- 父项\n  - 子项\n\n```go\nfmt.Println("保留")\n```\n\n结束',
  );
  const editor = page.getByRole("textbox", { name: "Markdown 正文" });
  await expect(editor.getByRole("table")).toContainText("中文");
  await expect(editor.locator("pre")).toContainText('fmt.Println("保留")');
  await expect(page.getByRole("status")).toHaveText("已保存");
  const old = await (await request.get("/api/v1/pages/" + n.id)).json();
  expect(old.body_document.blocks.some((b: any) => b.type === "table")).toBe(
    true,
  );
  expect(old.body_document.blocks.some((b: any) => b.children.length > 0)).toBe(
    true,
  );
  await page.getByLabel("上传附件").setInputFiles({
    name: "image.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(editor.getByRole("img")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await editor.locator('[data-content-type="paragraph"]').last().click();
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("/export");
  const downloading = page.waitForEvent("download");
  await page.getByRole("option", { name: /导出 Markdown/ }).click();
  const file = await downloading;
  const text = await readFile((await file.path())!, "utf8");
  expect(text).toContain("文档");
  expect(text).toContain("中文");
  expect(text).toContain("fmt.Println");
  expect(text).toContain("/api/v1/assets/");
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.reload();
  await expect(editor.getByRole("table")).toContainText("中文");
  await expect(editor.getByRole("img")).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({
    path: "/tmp/noteapp-block-formats.png",
    fullPage: true,
  });
});
test("dragging a block preserves its identity and saves the new order", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/v1/projects", {
      data: { title: "拖动验证 " + Date.now() },
    })
  ).json();
  const n = await (
    await request.post(`/api/v1/projects/${p.id}/pages`, {
      data: { title: "拖动笔记", body: "第一段\n\n第二段\n\n第三段" },
    })
  ).json();
  await page.goto(`/projects/${p.id}/pages/${n.id}`);
  const editor = page.getByRole("textbox", { name: "Markdown 正文" });
  const first = editor.getByText("第一段", { exact: true });
  const third = editor.getByText("第三段", { exact: true });
  await first.hover();
  const handle = page.getByRole("button", { name: "打开菜单", exact: true });
  await handle.dragTo(third, { targetPosition: { x: 30, y: 25 } });
  await expect(page.getByRole("status")).toHaveText("已保存");
  await expect
    .poll(async () => {
      const stored = await (await request.get("/api/v1/pages/" + n.id)).json();
      return stored.body_document?.blocks
        .map((b: any) => b.content?.map((v: any) => v.text).join(""))
        .join("|");
    })
    .not.toBe("第一段|第二段|第三段");
  const stored = await (await request.get("/api/v1/pages/" + n.id)).json();
  expect(stored.body_document.blocks).toHaveLength(3);
  expect(stored.body).toContain("第一段");
  expect(stored.body).toContain("第二段");
  expect(stored.body).toContain("第三段");
});
