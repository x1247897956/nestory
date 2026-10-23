import { test, expect } from "@playwright/test";
const mayClose = () =>
  window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
test("new Page and Task drafts guard routing and closing without flagging empty defaults", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/v1/projects", {
      data: { title: "新建草稿保护 " + Date.now() },
    })
  ).json();
  await page.goto("/projects/" + p.id + "/pages");
  expect(await page.evaluate(mayClose)).toBe(true);
  await page.getByLabel("新页面标题").fill("未提交页面");
  expect(await page.evaluate(mayClose)).toBe(false);
  let warned = false;
  page.once("dialog", async (d) => {
    warned = true;
    await d.dismiss();
  });
  await page.getByRole("link", { name: /^任务/ }).click();
  await expect.poll(() => warned).toBe(true);
  await expect(page.getByLabel("新页面标题")).toHaveValue("未提交页面");
  await page.getByLabel("新页面标题").fill("");
  await page.getByRole("link", { name: /^任务/ }).click();
  expect(await page.evaluate(mayClose)).toBe(true);
  await page.getByLabel("新任务标题").fill("未提交任务");
  expect(await page.evaluate(mayClose)).toBe(false);
  warned = false;
  page.once("dialog", async (d) => {
    warned = true;
    await d.dismiss();
  });
  await page.getByRole("link", { name: "今日工作台", exact: true }).click();
  await expect.poll(() => warned).toBe(true);
  await expect(page.getByLabel("新任务标题")).toHaveValue("未提交任务");
  await page.getByLabel("新任务标题").fill("");
  expect(await page.evaluate(mayClose)).toBe(true);
});
test("new Project draft guards closing and cancel while empty form stays clean", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "新建项目", exact: true })
    .first()
    .click();
  expect(await page.evaluate(mayClose)).toBe(true);
  await page.getByLabel("项目名称").fill("未提交项目");
  expect(await page.evaluate(mayClose)).toBe(false);
  let warned = false;
  page.once("dialog", async (d) => {
    warned = true;
    await d.dismiss();
  });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect.poll(() => warned).toBe(true);
  await expect(page.getByLabel("项目名称")).toHaveValue("未提交项目");
  await page.getByLabel("项目名称").fill("");
  expect(await page.evaluate(mayClose)).toBe(true);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
