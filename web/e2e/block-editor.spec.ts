import { block, documentOf } from "./block-fixtures";
import { test, expect } from "@playwright/test";
test("native blocks preserve checklist identity, slash commands and assets across object types", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/v1/projects", {
      data: { title: "块编辑 " + Date.now() },
    })
  ).json();
  for (const kind of ["tasks", "pages", "events"]) {
    const original = documentOf(block("heading", "旧标题", {level: 1}), block("checkListItem", "同名", {checked: false}), block("checkListItem", "同名", {checked: false}), block("codeBlock", "- [ ] 保持代码", {language: "javascript"}), block("paragraph", "末尾"));
    const item = await (
      await request.post(`/api/v1/projects/${p.id}/${kind}`, {
        data: {
          title: "块正文 " + kind,
          body_document: original,
          ...(kind === "events"
            ? {
                start_at: "2026-10-25T09:00:00Z",
                end_at: "2026-10-25T10:00:00Z",
              }
            : {}),
        },
      })
    ).json();
    const path = `/api/v1/${kind}/${item.id}`;
    await page.goto(`/projects/${p.id}/${kind}/${item.id}`);
    const editor = page.getByRole("textbox", { name: "Markdown 正文" });
    await expect(editor.getByRole("heading", { name: "旧标题" })).toBeVisible();
    await expect(editor.getByRole("checkbox")).toHaveCount(2);
    await page.waitForTimeout(1000);
    const untouched = await (await request.get(path)).json();
    expect(untouched.version).toBe(1);
    expect(untouched.body_document).toEqual(original);
    expect(untouched).not.toHaveProperty("body");
    expect(untouched).not.toHaveProperty("legacy_body");
    await editor.getByRole("checkbox").nth(1).check();
    await expect(page.getByRole("status")).toHaveText("已保存");
    let stored = await (await request.get(path)).json();
    expect(stored).not.toHaveProperty("legacy_body");
    expect(stored).not.toHaveProperty("body");
    expect(stored.body_document.version).toBe(1);
    expect(
      stored.body_document.blocks
        .filter((b: any) => b.type === "checkListItem")
        .map((b: any) => b.props.checked),
    ).toEqual([false, true]);
    expect(
      stored.body_document.blocks.find((b: any) => b.type === "codeBlock")
        .content[0].text,
    ).toContain("- [ ] 保持代码");
    await editor.locator('[data-content-type="paragraph"]').last().click();
    await editor.press("End");
    await editor.press("Enter");
    await editor.pressSequentially("/h2");
    await expect(
      page.getByRole("option", { name: /二级标题/ }).first(),
    ).toBeVisible();
    await editor.press("Enter");
    await editor.pressSequentially("新的小节");
    await expect(
      editor.getByRole("heading", { name: "新的小节" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("已保存");
    await page.reload();
    await expect(
      editor.getByRole("heading", { name: "新的小节" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "源码", exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("上传附件")
      .setInputFiles({
        name: "proof.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("block asset"),
      });
    await expect(editor).toContainText("proof.txt");
    await expect(page.getByRole("status")).toHaveText("已保存");
    stored = await (await request.get(path)).json();
    expect(
      stored.body_document.blocks.some(
        (b: any) =>
          b.type === "file" && b.props.url.startsWith("/api/v1/assets/"),
      ),
    ).toBe(true);
    await page.reload();
    await expect(editor).toContainText("proof.txt");
  }
  await page.screenshot({
    path: "/tmp/noteapp-block-editor.png",
    fullPage: true,
  });
});
test("empty metadata preserves the native document; block copy, undo, slash keyboard and read-only mode", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/v1/projects", {
      data: { title: "块操作 " + Date.now() },
    })
  ).json();
  const t = await (
    await request.post(`/api/v1/projects/${p.id}/tasks`, {
      data: { title: "交互检查" },
    })
  ).json();
  const path = "/api/v1/tasks/" + t.id;
  await page.goto(`/projects/${p.id}/tasks/${t.id}`);
  await page.getByLabel("阶段", { exact: true }).selectOption("in_process");
  await expect(page.getByRole("status")).toHaveText("已保存");
  expect((await (await request.get(path)).json()).body_document).toEqual({version: 1, blocks: []});
  const editor = page.getByRole("textbox", { name: "Markdown 正文" });
  await editor.click();
  await editor.pressSequentially("/h2");
  await expect(
    page.getByRole("option", { name: /二级标题/ }).first(),
  ).toBeVisible();
  await editor.press("Escape");
  await expect(page.getByRole("option", { name: /二级标题/ })).toHaveCount(0);
  await editor.press("ControlOrMeta+a");
  await editor.press("Backspace");
  await editor.pressSequentially("/h2");
  await editor.press("ArrowDown");
  await editor.press("ArrowUp");
  await editor.press("Enter");
  await editor.pressSequentially("块标题");
  await expect(editor.getByRole("heading", { name: "块标题" })).toBeVisible();
  await editor.press("Enter");
  await editor.pressSequentially("撤销内容");
  await editor.press("ControlOrMeta+z");
  await expect(editor).not.toContainText("撤销内容");
  await editor.press("ControlOrMeta+Shift+z");
  await expect(editor).toContainText("撤销内容");
  const heading = editor.getByRole("heading", { name: "块标题" });
  // Playwright hover can trigger a late scroll, which intentionally hides
  // BlockNote's side menu. Move within the block after that scroll commits,
  // like a pointer approaching its handle, rather than waiting motionless.
  await heading.hover();
  await page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const headingBox = await heading.boundingBox();
  expect(headingBox).not.toBeNull();
  await page.mouse.move(headingBox!.x + 8, headingBox!.y + headingBox!.height / 2, { steps: 3 });
  await page.getByRole("button", { name: "打开菜单", exact: true }).click();
  await page.getByRole("menuitem", { name: "复制块", exact: true }).click();
  await expect(editor.getByRole("heading", { name: "块标题" })).toHaveCount(2);
  await expect(page.getByRole("status")).toHaveText("已保存");
  const stored = await (await request.get(path)).json();
  const ids = stored.body_document.blocks.map((b: any) => b.id);
  expect(new Set(ids).size).toBe(ids.length);
  await page.getByRole("button", { name: "归档项目", exact: true }).click();
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect(
    page.getByRole("button", { name: "打开菜单", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(editor.getByRole("heading", { name: "块标题" })).toHaveCount(2);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.waitForTimeout(700);
  await page.screenshot({
    path: "/tmp/noteapp-block-mobile.png",
    fullPage: true,
  });
});
