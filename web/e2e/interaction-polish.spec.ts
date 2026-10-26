import {expandProperties} from "./property-actions";
import { paragraphs } from "./block-fixtures";
import { test, expect } from "@playwright/test";
test("project names are plain and parent selection is automatic without losing body drafts", async ({
  page,
  request,
}) => {
  const post = async (path: string, data: unknown) =>
    await (await request.post("/api/v1" + path, { data })).json();
  const p = await post("/projects", { title: "交互项目 " + Date.now() });
  const a = await post(`/projects/${p.id}/tasks`, { title: "父任务甲" });
  const b = await post(`/projects/${p.id}/tasks`, { title: "父任务乙" });
  const child = await post(`/projects/${p.id}/tasks`, {
    title: "当前任务",
    body_document: paragraphs("原始正文"),
  });
  await page.goto(`/projects/${p.id}/tasks/${child.id}`);await expandProperties(page);
  await expect(page.locator(".project-icon")).toHaveCount(0);
  const parent = page.getByRole("combobox", { name: "父任务", exact: true });
  await parent.selectOption(a.id);
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/v1/tasks/" + child.id)).json())
          .parent_id,
    )
    .toBe(a.id);
  await page.getByLabel("Markdown 正文").fill("移动后继续写作");
  await expect(parent).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await parent.selectOption(b.id);
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/v1/tasks/" + child.id)).json())
          .parent_id,
    )
    .toBe(b.id);
  await expect(parent).toBeEnabled();
  await parent.selectOption("");
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/v1/tasks/" + child.id)).json())
          .parent_id,
    )
    .toBeNull();
  await page.reload();await expandProperties(page);
  await expect(page.getByLabel("Markdown 正文")).toContainText(
    "移动后继续写作",
  );
  await expect(parent).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "保存任务", exact: true }),
  ).toHaveCount(0);
  await post(`/projects/${p.id}/tasks`, {
    title: "已有子任务",
    parent_id: child.id,
  });
  await page.reload();await expandProperties(page);
  await expect(parent).toBeDisabled();
});
test("calendar opens a compact default draft and creates automatically after valid input", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/v1/projects", {
      data: { title: "日历交互 " + Date.now() },
    })
  ).json();
  await page.goto(`/projects/${p.id}/events`);await expandProperties(page);
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
  await expect(page.getByText(/显示与输入时区|日程显示与输入时区/)).toHaveCount(
    0,
  );
  await page
    .locator(".fc-daygrid-day[data-date]")
    .filter({ hasNot: page.locator(".fc-day-other") })
    .nth(10)
    .click();
  const dialog = page.getByRole("dialog", { name: "新建日程" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("新日程开始")).toHaveValue(/T09:00$/);
  await dialog.getByLabel("新日程结束").fill("2020-01-01T08:00");
  await dialog.getByLabel("新日程标题").fill("自动保存的日程");
  await page.waitForTimeout(1000);
  expect(
    await (
      await request.get(
        `/api/v1/projects/${p.id}/events?from=2020-01-01T00:00:00Z&to=2020-12-31T00:00:00Z`,
      )
    ).json(),
  ).toHaveLength(0);
  const start = await dialog.getByLabel("新日程开始").inputValue();
  await dialog.getByLabel("新日程结束").fill(start.slice(0, 10) + "T10:00");
  await expect(page.getByLabel("日程标题", { exact: true })).toHaveValue(
    "自动保存的日程",
  );
  await expect(
    page.getByRole("button", { name: "保存日程", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("日程标题", { exact: true }).fill("改名也自动保存");
  await expect(page.getByRole("status")).toHaveText("已保存");
  await page.reload();await expandProperties(page);
  await expect(page.getByLabel("日程标题", { exact: true })).toHaveValue(
    "改名也自动保存",
  );
});
