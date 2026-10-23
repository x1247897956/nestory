import { test, expect } from "@playwright/test";
test("page tree, source-position tasks, autosave failures and persistent safe assets", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/v1/projects", {
      data: { title: "笔记验收 " + Date.now() },
    })
  ).json();
  await page.goto("/projects/" + p.id + "/pages");
  for (const [title, parent] of [
    ["A", ""],
    ["B", "A"],
    ["C", "B"],
  ]) {
    await page.getByLabel("新页面标题").fill(title);
    if (parent) {
      const opts = await page
        .getByLabel("新页面父级")
        .locator("option")
        .allTextContents();
      await page
        .getByLabel("新页面父级")
        .selectOption({ label: opts.find((n) => n === parent)! });
    }
    await page.getByRole("button", { name: "新建页面", exact: true }).click();
    await expect(page.getByLabel("页面标题", { exact: true })).toHaveValue(
      title,
    );
  }
  const nodes = await (
    await request.get("/api/v1/projects/" + p.id + "/pages")
  ).json();
  const a = nodes.find((n: { title: string }) => n.title === "A");
  const c = nodes.find((n: { title: string }) => n.title === "C");
  expect(
    (
      await request.post("/api/v1/pages/" + a.id + "/move", {
        data: { parent_id: c.id, position: 0, version: a.version },
      })
    ).status(),
  ).toBe(409);
  const source = "中文笔记\n\n- [ ] 同名\n- [ ] 同名\n\n```js\n- [ ] 代码\n```";
  await page.getByLabel("Markdown 正文").fill(source);
  await page.getByRole("button", { name: "分屏", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await page.getByRole("checkbox").nth(1).check();
  await expect(page.getByLabel("Markdown 正文")).toContainText("- [x] 同名");
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.reload();
  await expect(page.getByLabel("Markdown 正文")).toContainText("- [x] 同名");
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
  const navigation = page.locator(".project-tabs a").first().click();
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
  await expect(page.getByLabel("Markdown 正文")).toContainText(
    "/api/v1/assets/",
  );
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.getByRole("button", { name: "预览", exact: true }).click();
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
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("img")).toBeVisible();
  await expect(page.getByRole("button", { name: /删除/ })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/noteapp-stage2.png", fullPage: true });
});
