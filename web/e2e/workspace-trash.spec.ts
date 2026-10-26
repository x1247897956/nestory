import {expandProperties} from "./property-actions";
import { openObjectDelete } from "./object-actions";
import { archiveCurrentProject } from "./project-actions";
import { test, expect } from "@playwright/test";
test("workspace search, preview reconfirmation, batch isolation, relations and archive", async ({
  page,
  request,
}) => {
  const create = async (path: string, data: unknown) => {
    const r = await request.post("/api/v1" + path, { data });
    expect(r.status()).toBe(201);
    return r.json();
  };
  const p = await create("/projects", { title: "全局验收 " + Date.now() });
  const a = await create("/projects/" + p.id + "/pages", {
    title: "祖先中文%_",
  });
  const c = await create("/projects/" + p.id + "/pages", {
    title: "先删后代",
    parent_id: a.id,
  });
  const t = await create("/projects/" + p.id + "/tasks", { title: "关联任务" });
  expect(
    (
      await request.put("/api/v1/relations/task-page/" + t.id + "/" + c.id)
    ).ok(),
  ).toBeTruthy();
  await page.goto("/projects/" + p.id + "/pages/" + c.id);await expandProperties(page);
  await openObjectDelete(page);
  await expect(page.getByRole("dialog")).toContainText("共 1 个对象");
  await page.getByRole("button", { name: "确认删除 1 个对象" }).click();
  await expect(page).toHaveURL(new RegExp("/projects/" + p.id + "/pages$"));
  await page.goto("/projects/" + p.id + "/tasks/" + t.id);await expandProperties(page);
  await page.locator(".relation-property > summary").click();
  await expect(page.getByText("已删除 · 先删后代")).toBeVisible();
  await page.getByLabel("任务标题", { exact: true }).fill("未保存草稿");
  await openObjectDelete(page);
  await expect(page.getByRole("alert")).toContainText("请先保存或放弃");
  await expect(page.getByLabel("任务标题", { exact: true })).toHaveValue(
    "未保存草稿",
  );
  await page.getByLabel("任务标题", { exact: true }).fill("关联任务");

  await page.goto("/projects/" + p.id + "/pages/" + a.id);await expandProperties(page);
  await openObjectDelete(page);
  await create("/projects/" + p.id + "/pages", {
    title: "后来新增",
    parent_id: a.id,
  });
  await page.getByRole("button", { name: "确认删除 1 个对象" }).click();
  await expect(page.getByRole("alert")).toContainText("再次确认");
  await expect(page.getByRole("dialog")).toContainText("共 2 个对象");
  await page.getByRole("button", { name: "确认删除 2 个对象" }).click();
  await expect(page).toHaveURL(new RegExp("/projects/" + p.id + "/pages$"));
  await page.getByRole("link", { name: "回收站", exact: true }).click();
  await page
    .getByRole("button", { name: "恢复 先删后代", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("先恢复");
  await page
    .getByRole("button", { name: "恢复 祖先中文%_", exact: true })
    .click();
  expect((await request.get("/api/v1/pages/" + c.id)).status()).toBe(404);
  await page
    .getByRole("button", { name: "恢复 先删后代", exact: true })
    .click();
  expect((await request.get("/api/v1/pages/" + c.id)).status()).toBe(200);
  await page.getByRole("link", { name: "搜索", exact: true }).click();
  await page.getByLabel("搜索标题与正文").fill("中文%_");
  await expect(
    page.locator('a[href="/projects/' + p.id + "/pages/" + a.id + '"]'),
  ).toBeVisible();
  await page
    .locator('a[href="/projects/' + p.id + "/pages/" + a.id + '"]')
    .click();
  await expect(page.getByLabel("笔记标题", { exact: true })).toHaveValue(
    "祖先中文%_",
  );

  const event = await create("/projects/" + p.id + "/events", {
    title: "归档前删除日程 " + p.id,
    start_at: "2026-10-23T00:00:00+08:00",
    end_at: "2026-10-23T01:00:00+08:00",
  });
  const preview = await (
    await request.get("/api/v1/events/" + event.id + "/delete-preview")
  ).json();
  expect(
    (
      await request.delete("/api/v1/events/" + event.id, { data: preview })
    ).ok(),
  ).toBeTruthy();
  await archiveCurrentProject(page);
  await expect(
    page.getByText("此项目已归档，内容只读。取消归档后可继续编辑。"),
  ).toBeVisible();
  await expect(page.getByLabel("笔记标题", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "移入回收站" })).toHaveCount(0);
  expect(
    (
      await request.patch("/api/v1/tasks/" + t.id, {
        data: { version: t.version, title: "forbidden" },
      })
    ).status(),
  ).toBe(409);
  await page.getByRole("link", { name: "搜索", exact: true }).click();
  await page.getByLabel("搜索标题与正文").fill("中文%_");
  await expect(page.getByText("0 条结果")).toBeVisible();
  await page.getByLabel("包含归档").check();
  await expect(
    page.locator('a[href="/projects/' + p.id + "/pages/" + a.id + '"]'),
  ).toBeVisible();

  await page.getByRole("link", { name: "回收站", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "恢复 归档前删除日程 " + p.id,
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByText("项目已归档，请先取消归档再恢复。").first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "工作台", exact: true }).click();
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近访问" })).toBeVisible();
});
