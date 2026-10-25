import {importMarkdown} from "./editor-helpers";
import { test, expect } from "@playwright/test";
test("flat notes, source-position tasks, autosave failures and persistent safe assets", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/v1/projects", {
      data: { title: "笔记验收 " + Date.now() },
    })
  ).json();
  await page.goto("/projects/" + p.id + "/pages");
  for (const title of ["A", "B", "C"]) {
    await page.goto("/projects/" + p.id + "/pages");
    await page.getByRole("button", { name: "新建笔记", exact: true }).click();
    const titleField = page.getByLabel("笔记标题", { exact: true });
    await expect(titleField).toHaveValue("无标题笔记");
    await expect(titleField).toBeFocused();
    await titleField.fill(title);
    await expect(page.getByRole("status")).toHaveText("已保存");
  }
  const nodes = await (
    await request.get("/api/v1/projects/" + p.id + "/pages")
  ).json();
  const c = nodes.find((n: { title: string }) => n.title === "C");
  expect(nodes.every((n: {parent_id: string | null})=>n.parent_id===null)).toBe(true);
  const source = "中文笔记\n\n- [ ] 同名\n- [ ] 同名\n\n```js\n- [ ] 代码\n```";
  await importMarkdown(page,source);
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await page.getByRole("checkbox").nth(1).check();
  await expect(page.locator(".bn-editor").getByRole("checkbox").nth(1)).toBeChecked();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.reload();
  await expect(page.locator(".bn-editor").getByRole("checkbox").nth(1)).toBeChecked();
  await page.route("**/api/v1/pages/" + c.id, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "模拟保存失败" } }),
      });
    else await route.continue();
  });
  await page.getByLabel("Markdown 正文").fill("失败时全文保留");
  await expect(page.getByRole("alert")).toContainText("模拟保存失败");
  await expect(page.getByLabel("Markdown 正文")).toHaveText("失败时全文保留");
  const dialog = page.waitForEvent("dialog");
  const navigation = page.getByRole("link", {name:"汇总", exact:true}).click();
  await (await dialog).dismiss();
  await navigation;
  await expect(page.getByLabel("Markdown 正文")).toHaveText("失败时全文保留");
  await page.unroute("**/api/v1/pages/" + c.id);
  await page.getByRole("button", { name: "重试保存" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.route("**/api/v1/projects/" + p.id + "/assets", (r) =>
    r.fulfill({
      status: 413,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "超出限制" } }),
    }),
  );
  await page
    .getByLabel("上传附件")
    .setInputFiles({
      name: "large.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("too large"),
    });
  await expect(page.getByRole("alert")).toContainText("超出限制");
  await page.unroute("**/api/v1/projects/" + p.id + "/assets");
  await page
    .getByLabel("上传附件")
    .setInputFiles({
      name: "image.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.locator(".bn-editor img")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await expect(page.getByRole("img")).toBeVisible();
  const url = await page.getByRole("img").getAttribute("src");
  expect((await request.get(url!)).headers()["content-disposition"]).toContain(
    "inline",
  );
  const html = await request.post("/api/v1/projects/" + p.id + "/assets", {
    multipart: {
      file: {
        name: "danger.html",
        mimeType: "text/html",
        buffer: Buffer.from("<script>alert(1)</script>"),
      },
    },
  });
  expect(html.status()).toBe(201);
  const asset = await html.json();
  const dl = await request.get(asset.url);
  expect(dl.headers()["content-disposition"]).toContain("attachment");
  expect(dl.headers()["x-content-type-options"]).toBe("nosniff");
  await page.reload();
  await expect(page.getByRole("img")).toBeVisible();
  await expect(page.getByRole("button", { name: /删除/ })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/noteapp-stage2.png", fullPage: true });
});

test("quick create retries failures and creates one blank note from overview entry", async ({ page, request }) => {
  const project = await (await request.post("/api/v1/projects", { data: { title: "快捷笔记 " + Date.now() } })).json();
  const endpoint = "**/api/v1/projects/" + project.id + "/pages";
  let attempts = 0;
  await page.route(endpoint, async route => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    expect(route.request().postDataJSON()).toMatchObject({ title: "无标题笔记", parent_id: null, request_id: expect.any(String) });
    if (attempts === 1) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "模拟新建失败" } }) });
    await route.continue();
  });
  await page.goto(`/projects/${project.id}/pages?create=1`);
  await expect(page.getByRole("alert")).toContainText("模拟新建失败");
  expect(attempts).toBe(1);
  await expect(page.getByRole("button", { name: "新建笔记", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重试新建" }).click();
  const title = page.getByLabel("笔记标题", { exact: true });
  await expect(title).toHaveValue("无标题笔记");
  await expect(title).toBeFocused();
  expect(await title.evaluate((input: HTMLInputElement) => input.selectionStart === 0 && input.selectionEnd === input.value.length)).toBe(true);
  await expect(page.getByRole("button", { name: "保存笔记", exact: true })).toHaveCount(0);
  const notes = await (await request.get(`/api/v1/projects/${project.id}/pages`)).json();
  expect(notes).toHaveLength(1);
  expect(attempts).toBe(2);
});
