import { test, expect } from "@playwright/test";
import { DateTime } from "luxon";
for (const timezoneId of ["America/Los_Angeles", "Europe/London"]) {
  test(
    "calendar and all relations in browser " + timezoneId,
    async ({ browser, request, baseURL }) => {
      const context = await browser.newContext({ timezoneId, baseURL });
      const page = await context.newPage();
      const create = async (path: string, data: unknown) => {
        const r = await request.post("/api/v1" + path, { data });
        expect(r.ok()).toBeTruthy();
        return r.json();
      };
      const p = await create("/projects", {
        title: "毕业设计 " + timezoneId + " " + Date.now(),
      });
      const root = await create("/projects/" + p.id + "/pages", {
        title: "方案集",
      });
      const pg = await create("/projects/" + p.id + "/pages", {
        title: "实验方案",
        parent_id: root.id,
      });
      const task = await create("/projects/" + p.id + "/tasks", {
        title: "执行实验",
        stage: "in_process",
        due_date: "2026-12-31",
      });
      const today = DateTime.now()
        .setZone("Asia/Shanghai")
        .startOf("week")
        .plus({ days: 2 })
        .toISODate()!;
      const tomorrow = DateTime.fromISO(today, { zone: "Asia/Shanghai" })
        .plus({ days: 1 })
        .toISODate()!;
      await page.goto("/projects/" + p.id + "/events");
      await expect(
        page.getByText("显示与输入时区：Asia/Shanghai"),
      ).toBeVisible();
      await expect(page.locator(".fc-timeGridWeek-view")).toBeVisible();
      await page.getByRole("button", { name: "月", exact: true }).click();
      await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
      await page
        .locator(
          '.fc-daygrid-day[data-date="' + today + '"] .fc-daygrid-day-frame',
        )
        .click({ position: { x: 20, y: 35 } });
      await page.getByLabel("新日程标题").fill("讨论方案");
      let draftWarning = false;
      page.once("dialog", async (dialog) => {
        draftWarning = true;
        await dialog.dismiss();
      });
      await page.getByRole("link", { name: "汇总", exact: true }).click();
      await expect.poll(() => draftWarning).toBe(true);
      expect(
        await page.evaluate(() =>
          window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
        ),
      ).toBe(false);
      await expect(page.getByLabel("新日程标题")).toHaveValue("讨论方案");
      await page.getByLabel("新日程开始").fill(today + "T23:00");
      await page.getByLabel("新日程结束").fill(tomorrow + "T01:00");
      await page.getByRole("button", { name: "创建日程", exact: true }).click();
      await expect(page.getByLabel("日程标题", { exact: true })).toHaveValue(
        "讨论方案",
      );
      await expect(page.getByLabel("开始时间", { exact: true })).toHaveValue(
        today + "T23:00",
      );
      const eventId = page.url().split("/").pop()!;
      await page.getByLabel("Markdown 正文").fill("# 讨论\n\n- [ ] 方案");
      await expect(page.getByRole("status")).toHaveText("已保存");
      await page.reload();
      await expect(page.getByLabel("Markdown 正文")).toContainText("# 讨论");
      await page.getByRole("button", {name:"关闭日程详情"}).click();
      await page.getByRole("button", { name: "周", exact: true }).click();
      await expect(page.locator(".fc-timegrid-event")).toHaveCount(2);
      await expect(page.locator(".fc-timegrid-event").first()).toContainText(
        "23:00",
      );
      await expect(page.locator(".fc-timegrid-event").nth(1)).toContainText(
        "01:00",
      );
      await page.goto("/projects/"+p.id+"/events/"+eventId);
      if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
      await page
        .getByLabel("关联目标")
        .selectOption({ label: "方案集 / 实验方案" });
      await page.getByRole("button", { name: "添加关联", exact: true }).click();
      await expect(
        page.getByRole("link", { name: "方案集 / 实验方案", exact: true }),
      ).toBeVisible();
      await page.getByLabel("搜索关联标题").fill("执行");
      await page
        .getByLabel("关联目标")
        .selectOption({ label: "执行实验 · InProcess" });
      await page.getByRole("button", { name: "添加关联", exact: true }).click();
      await expect(
        page.getByRole("link", { name: "执行实验 · InProcess" }),
      ).toBeVisible();
      // Event time edits do not change task date; UI keeps deployment-zone wall time.
      await page.getByLabel("开始时间", { exact: true }).fill(today + "T22:00");
      await expect(page.getByRole("status")).toHaveText("已保存");
      expect(
        (await (await request.get("/api/v1/tasks/" + task.id)).json()).due_date,
      ).toBe("2026-12-31");
      if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
      await page
        .getByRole("link", { name: "方案集 / 实验方案", exact: true })
        .click();
      await expect(page.getByLabel("笔记标题", {exact:true})).toHaveValue("实验方案");
      if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
      await expect(
        page.getByRole("link", {
          name: new RegExp("讨论方案 · " + today + " 22:00"),
        }),
      ).toBeVisible();
      await page
        .getByLabel("关联目标")
        .selectOption({ label: "执行实验 · InProcess" });
      await page.getByRole("button", { name: "添加关联", exact: true }).click();
      await page
        .getByRole("link", { name: "执行实验 · InProcess", exact: true })
        .click();
      await expect(page.getByLabel("任务标题", {exact:true})).toHaveValue("执行实验");
      if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
      await expect(
        page.getByRole("link", { name: "方案集 / 实验方案", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /讨论方案 ·/ }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "移除关联 实验方案", exact: true })
        .click();
      await page.goto("/projects/" + p.id + "/pages/" + pg.id);
      if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
      await expect(
        page.getByRole("button", { name: "移除关联 执行实验", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "移除关联 讨论方案", exact: true })
        .click();
      await page.goto("/projects/" + p.id + "/events/" + eventId);
      if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
      await expect(
        page.getByRole("button", { name: "移除关联 实验方案", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "移除关联 执行实验", exact: true })
        .click();
      await page.goto("/projects/" + p.id + "/tasks/" + task.id);
      if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
      await expect(
        page.getByRole("button", { name: "移除关联 讨论方案", exact: true }),
      ).toHaveCount(0);
      const other = await create("/projects", { title: "其他" });
      const foreign = await create("/projects/" + other.id + "/pages", {
        title: "外部笔记",
      });
      expect(
        (
          await request.put(
            "/api/v1/relations/task-page/" + task.id + "/" + foreign.id,
          )
        ).status(),
      ).toBe(409);
      await page.getByLabel("搜索关联标题").fill("外部");
      await expect(page.getByLabel("关联目标").locator("option")).toHaveCount(
        1,
      );

      const secondsEvent = await create("/projects/" + p.id + "/events", {
        title: "精确秒日程",
        start_at: today + "T09:00:30+08:00",
        end_at: today + "T10:00:45+08:00",
      });
      await page.goto("/projects/" + p.id + "/events/" + secondsEvent.id);
      await page.getByLabel("Markdown 正文").fill("只改正文");
      await expect(page.getByRole("status")).toHaveText("已保存");
      const precise = await (
        await request.get("/api/v1/events/" + secondsEvent.id)
      ).json();
      expect(precise.start_at).toBe(today + "T01:00:30Z");
      expect(precise.end_at).toBe(today + "T02:00:45Z");
      await page.goto("/projects/" + p.id + "/events/" + eventId);
      if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
      await expect(page.getByLabel("开始时间", { exact: true })).toHaveValue(
        today + "T22:00",
      );
      await page.getByRole("button", { name: "归档项目", exact: true }).click();
      await expect(page.getByLabel("开始时间", { exact: true })).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "添加关联", exact: true }),
      ).toHaveCount(0);
      expect(
        (
          await request.put(
            "/api/v1/relations/task-event/" + task.id + "/" + eventId,
          )
        ).status(),
      ).toBe(409);
      await page.screenshot({
        path: "/tmp/noteapp-stage3-" + timezoneId.split("/")[1] + ".png",
        fullPage: true,
      });
      await context.close();
    },
  );
}
