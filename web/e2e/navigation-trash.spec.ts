import {closeObject} from "./object-actions";
import { test, expect } from "@playwright/test";
test("breadcrumbs name the current surface and project options dismiss naturally", async ({
  page,
  request,
}) => {
  for (const [path, label] of [
    ["/", "工作台"],
    ["/search", "搜索"],
    ["/trash", "回收站"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "面包屑" })).toHaveText(
      label,
    );
  }
  await page.goto("/");
  const options = page.locator(".project-options");
  const summary = page.getByText("⋯", { exact: true }).first();
  await summary.click();
  await expect(options).toHaveAttribute("open", "");
  await page.getByRole("heading", { name: "工作台", exact: true }).click();
  await expect(options).not.toHaveAttribute("open", "");
  await summary.click();
  await page.keyboard.press("Escape");
  await expect(options).not.toHaveAttribute("open", "");
  await summary.click();
  await page
    .getByRole("button", { name: "查看已归档项目", exact: true })
    .click();
  await expect(options).not.toHaveAttribute("open", "");
  await summary.click();
  await closeObject(page);
  await page.getByRole("link", { name: "搜索", exact: true }).click();
  await expect(options).not.toHaveAttribute("open", "");
  const p = await (
    await request.post("/api/v1/projects", {
      data: { title: "层级导航 " + Date.now() },
    })
  ).json();
  for (const kind of ["tasks", "pages", "events"]) {
    const o = await (
      await request.post(`/api/v1/projects/${p.id}/${kind}`, {
        data: {
          title: "对象 " + kind,
          ...(kind === "events"
            ? {
                start_at: "2026-10-25T09:00:00Z",
                end_at: "2026-10-25T10:00:00Z",
              }
            : {}),
        },
      })
    ).json();
    await page.goto(`/projects/${p.id}/${kind}/${o.id}`);
    const crumbs = page.getByRole("navigation", { name: "面包屑" });
    await expect(crumbs).toHaveText(`${p.title}/${kind==="tasks"?"任务":kind==="pages"?"笔记":"日程"}/对象 ${kind}`);
    await crumbs.getByRole("link", { name: "汇总", exact: true }).click();
    await expect(page).toHaveURL(`/projects/${p.id}`);
    await expect(crumbs).toHaveText(p.title);
  }
});
test("trash is a compact list with optional details and working restore", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/v1/projects", {
      data: { title: "回收简化 " + Date.now() },
    })
  ).json();
  const n = await (
    await request.post(`/api/v1/projects/${p.id}/pages`, {
      data: { title: "一条很长的删除笔记标题用于检查手机布局 " + p.id },
    })
  ).json();
  const preview = await (
    await request.get(`/api/v1/pages/${n.id}/delete-preview`)
  ).json();
  await request.delete(`/api/v1/pages/${n.id}`, { data: preview });
  await page.goto("/trash");
  const row = page
    .getByRole("listitem")
    .filter({
      has: page.getByRole("button", { name: "恢复 " + n.title, exact: true }),
    });
  await expect(row).toHaveClass(/trash-item/);
  await expect(
    row.getByRole("button", { name: "恢复 " + n.title, exact: true }),
  ).toHaveText("恢复");
  const disclosure = row.getByRole("button", { name: n.title, exact: true });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(row.getByRole("list")).toContainText(n.title);
  await disclosure.click();
  await expect(row.getByRole("list")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/noteapp-trash-compact-mobile.png",
    fullPage: true,
  });
  await row
    .getByRole("button", { name: "恢复 " + n.title, exact: true })
    .click();
  await expect(row).toHaveCount(0);
  expect((await request.get("/api/v1/pages/" + n.id)).status()).toBe(200);
});
