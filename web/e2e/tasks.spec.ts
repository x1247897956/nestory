import { test, expect } from "@playwright/test";
test("project, independent children, refresh, archive and two-tab conflict", async ({
  page,
  context,
  request,
}) => {
  const title = "毕业设计 " + Date.now();
  await page.goto("/");
  await page
    .getByRole("button", { name: "新建项目", exact: true })
    .first()
    .click();
  await page.getByLabel("项目名称").fill(title);
  await page.getByLabel("项目说明").fill("阅读与思考");
  await page.getByRole("button", { name: "保存项目" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("link", { name: "任务", exact: true }).click();
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await page.getByLabel("新任务标题").fill("读论文");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(page.getByLabel("任务标题", { exact: true })).toHaveValue(
    "读论文",
  );
  const parentURL = page.url();
  const parentID = parentURL.split("/").at(-1)!;
  const projectID = parentURL.split("/")[4];
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await page.getByLabel("新任务标题").fill("读摘要");
  await page.getByLabel("父任务", { exact: true }).selectOption(parentID);
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(page.getByLabel("任务标题", { exact: true })).toHaveValue(
    "读摘要",
  );
  const childID = page.url().split("/").at(-1)!;
  await page.goto(parentURL);
  await page.getByLabel("阶段", { exact: true }).selectOption("done");
  await page.getByLabel("优先级", { exact: true }).selectOption("high");
  await page.getByLabel("截止日期", { exact: true }).fill("2026-10-25");
  await page.getByLabel("Markdown 正文").fill("- [ ] 阅读全文");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已保存");
  const child = await (await request.get("/api/v1/tasks/" + childID)).json();
  expect(child.stage).toBe("todo");
  expect(
    (
      await request.post("/api/v1/projects/" + projectID + "/tasks", {
        data: { title: "第三层", parent_id: childID },
      })
    ).status(),
  ).toBe(409);
  await page.reload();
  await expect(page.getByLabel("Markdown 正文")).toHaveText("- [ ] 阅读全文");
  const second = await context.newPage();
  await second.goto(parentURL);
  await expect(second.getByLabel("Markdown 正文")).toHaveText("- [ ] 阅读全文");
  await page.getByLabel("Markdown 正文").fill("first tab");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await second.getByLabel("Markdown 正文").fill("second tab draft");
  await second.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(second.getByRole("alert")).toContainText("内容已更新");
  await expect(second.getByLabel("Markdown 正文")).toHaveText(
    "second tab draft",
  );
  await second.close();
  await page.getByRole("button", { name: "归档项目", exact: true }).click();
  await expect(page.getByLabel("Markdown 正文")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await page.getByRole("button", { name: "取消归档", exact: true }).click();
  await expect(page.getByLabel("Markdown 正文")).toHaveAttribute(
    "contenteditable",
    "true",
  );
  await expect(page.getByRole("button", { name: /删除/ })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/noteapp-stage1.png", fullPage: true });
});

test("navigation guards an in-flight save after reverting to baseline", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/v1/projects", {
      data: { title: "延迟导航 " + Date.now() },
    })
  ).json();
  const task = await (
    await request.post("/api/v1/projects/" + project.id + "/tasks", {
      data: { title: "保稿", body: "baseline A" },
    })
  ).json();
  await page.goto("/projects/" + project.id + "/tasks/" + task.id);
  await expect(page.getByLabel("Markdown 正文")).toHaveText("baseline A");
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  const began = new Promise<void>((r) => {
    started = r;
  });
  await page.route("**/api/v1/tasks/" + task.id, async (route) => {
    if (route.request().method() === "PATCH") {
      started();
      await pending;
    }
    await route.continue();
  });
  await page.getByLabel("Markdown 正文").fill("snapshot B");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await began;
  await page.getByLabel("Markdown 正文").fill("baseline A");
  const dialog = page.waitForEvent("dialog");
  const navigation = page.getByRole("link", {name:"汇总", exact:true}).click();
  await (await dialog).dismiss();
  await navigation;
  await expect(page.getByLabel("Markdown 正文")).toHaveText("baseline A");
  release();
  await expect(page.getByRole("status")).toHaveText("已保存");
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/v1/tasks/" + task.id)).json()).body.trim(),
    )
    .toBe("baseline A");
});
