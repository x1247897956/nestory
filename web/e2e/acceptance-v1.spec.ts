import { test, expect } from "@playwright/test";
import { DateTime } from "luxon";
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const fixturePath =
  process.env.NOTEAPP_ACCEPTANCE_FIXTURE ?? "/tmp/noteapp-acceptance-v1.json";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
  "base64",
);
if (!process.env.NOTEAPP_VERIFY_RESTORED) {
  test("v1 full journey in a fresh browser context", async ({
    page,
    request,
  }) => {
    test.setTimeout(90000);
    const title = "V1完整验收 " + Date.now();
    await page.goto("/");
    await page
      .getByRole("button", { name: "新建项目", exact: true })
      .first()
      .click();
    await page.getByLabel("项目名称").fill(title);
    await page.getByLabel("项目说明").fill("全功能恢复验收");
    await page.getByRole("button", { name: "保存项目" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    const pid = new URL(page.url()).pathname.split("/")[2];
    await page.getByRole("link", { name: "笔记", exact: true }).click();
    await page.getByLabel("新笔记标题").fill("完整笔记");
    await page.getByRole("button", { name: "新建笔记", exact: true }).click();
    await expect(page.getByLabel("笔记标题", { exact: true })).toHaveValue(
      "完整笔记",
    );
    const pgid = page.url().split("/").pop()!;
    await page
      .getByLabel("Markdown 正文")
      .fill('# 真实验收\n\n- [ ] 阅读\n\n```go\nfmt.Println("hello")\n```');
    await expect(page.getByRole("status")).toHaveText("已保存");
    await page
      .getByLabel("上传附件")
      .setInputFiles({
        name: "v1-image.png",
        mimeType: "image/png",
        buffer: png,
      });
    await expect(page.getByLabel("Markdown 正文")).toContainText(
      "/api/v1/assets/",
    );
    await expect(page.getByRole("status")).toHaveText("已保存");
    await page
      .getByLabel("上传附件")
      .setInputFiles({
        name: "v1-proof.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("V1附件中文\n"),
      });
    await expect
      .poll(async () => {
        const value = await page.getByLabel("Markdown 正文").textContent();
        return (value?.match(/\/api\/v1\/assets\//g) ?? []).length;
      })
      .toBe(2);
    await expect(page.getByRole("status")).toHaveText("已保存");
    await page.getByRole("button", { name: "预览", exact: true }).click();
    await expect(page.locator(".markdown-preview img")).toBeVisible();
    await expect(page.locator(".markdown-preview pre code")).toContainText(
      "fmt.Println",
    );
    await page.getByRole("link", { name: "汇总", exact: true }).click();
    await page.getByRole("link", { name: "任务", exact: true }).click();
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    await page.getByLabel("新任务标题").fill("读论文");
    await page.getByRole("button", { name: "创建任务", exact: true }).click();
    await expect(page.getByLabel("任务标题", { exact: true })).toHaveValue(
      "读论文",
    );
    const parent = page.url().split("/").pop()!;
    await page.getByLabel("阶段", { exact: true }).selectOption("done");
    await expect(page.getByRole("status")).toHaveText("已保存");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    await page.getByLabel("新任务标题").fill("读摘要");
    await page.getByLabel("父任务", { exact: true }).selectOption(parent);
    await page.getByRole("button", { name: "创建任务", exact: true }).click();
    await expect(page.getByLabel("任务标题", { exact: true })).toHaveValue(
      "读摘要",
    );
    const tid = page.url().split("/").pop()!;
    const today = DateTime.now().setZone("Asia/Shanghai").toISODate()!;
    await page.getByLabel("截止日期", { exact: true }).fill(today);
    await page.getByLabel("Markdown 正文").fill("- [ ] 独立检查项");
    await expect(page.getByRole("status")).toHaveText("已保存");
    if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
    await page.getByLabel("关联目标").selectOption({ label: "完整笔记" });
    await page.getByRole("button", { name: "添加关联", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "完整笔记", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "汇总", exact: true }).click();
    await page.getByRole("link", { name: "日程", exact: true }).click();
    await page.getByRole("button", { name: "月", exact: true }).click();
    await page
      .locator(
        '.fc-daygrid-day[data-date="' + today + '"] .fc-daygrid-day-frame',
      )
      .click({ position: { x: 20, y: 35 } });
    await page.getByLabel("新日程标题").fill("完整讨论");
    await page.getByLabel("新日程开始").fill(today + "T00:30");
    await page
      .getByLabel("新日程结束")
      .fill(DateTime.fromISO(today).plus({ days: 1 }).toISODate() + "T01:30");
    await page.getByRole("button", { name: "创建日程", exact: true }).click();
    await expect(page.getByLabel("日程标题", { exact: true })).toHaveValue(
      "完整讨论",
    );
    const eid = page.url().split("/").pop()!;
    await page.getByLabel("Markdown 正文").fill("日程正文可恢复");
    await expect(page.getByRole("status")).toHaveText("已保存");
    if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
    for (const label of ["完整笔记", "读摘要 · Todo"]) {
      await page.getByLabel("关联目标").selectOption({ label });
      await page.getByRole("button", { name: "添加关联", exact: true }).click();
      await expect(
        page.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }
    await page.getByRole("link", { name: "工作台", exact: true }).click();
    await expect(
      page.locator('a[href="/projects/' + pid + '/tasks/' + tid + '"]'),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/projects/' + pid + '/events/' + eid + '"]'),
    ).toBeVisible();
    await page.goto("/projects/" + pid + "/pages/" + pgid);
    await page.getByRole("button", { name: "归档项目", exact: true }).click();
    await expect(page.getByLabel("笔记标题", { exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "取消归档", exact: true }).click();
    await expect(page.getByLabel("笔记标题", { exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "移入回收站", exact: true }).click();
    await page
      .getByRole("button", { name: "确认删除 1 个对象", exact: true })
      .click();
    await page.getByRole("link", { name: "回收站", exact: true }).click();
    await page
      .getByRole("button", { name: "恢复 完整笔记", exact: true })
      .click();
    await page.goto("/projects/" + pid + "/pages/" + pgid);
    await expect(page.getByLabel("笔记标题", { exact: true })).toHaveValue(
      "完整笔记",
    );
    if (!await page.locator(".relation-property").evaluate(el => (el as HTMLDetailsElement).open)) await page.locator(".relation-property > summary").click();
    await expect(
      page.getByRole("link", { name: "读摘要 · Todo", exact: true }),
    ).toBeVisible();
    const body = (await (await request.get("/api/v1/pages/" + pgid)).json())
      .body;
    const assetIDs = [...body.matchAll(/\/api\/v1\/assets\/([a-f0-9]+)/g)].map(
      (m: any) => m[1],
    );
    const assets = [];
    for (const id of assetIDs) {
      const res = await request.get("/api/v1/assets/" + id);
      expect(res.status()).toBe(200);
      assets.push({
        id,
        sha256: createHash("sha256")
          .update(await res.body())
          .digest("hex"),
      });
    }
    writeFileSync(
      fixturePath,
      JSON.stringify(
        {
          project_id: pid,
          page_id: pgid,
          parent_id: parent,
          task_id: tid,
          event_id: eid,
          title,
          assets,
        },
        null,
        2,
      ),
    );
    await page.screenshot({
      path: "/tmp/noteapp-v1-journey.png",
      fullPage: true,
    });
  });
} else {
  test("restored v1 data, relations, Markdown and attachments remain usable", async ({
    page,
    request,
  }) => {
    const f = JSON.parse(readFileSync(fixturePath, "utf8"));
    for (const [kind, id] of [
      ["pages", f.page_id],
      ["tasks", f.task_id],
      ["events", f.event_id],
    ]) {
      const res = await request.get("/api/v1/" + kind + "/" + id);
      expect(res.status()).toBe(200);
      const relations = await (
        await request.get("/api/v1/" + kind + "/" + id + "/relations")
      ).json();
      expect(relations).toHaveLength(2);
    }
    expect(
      (await (await request.get("/api/v1/tasks/" + f.parent_id)).json()).stage,
    ).toBe("done");
    expect(
      (await (await request.get("/api/v1/tasks/" + f.task_id)).json()).stage,
    ).toBe("todo");
    for (const a of f.assets) {
      const res = await request.get("/api/v1/assets/" + a.id);
      expect(res.status()).toBe(200);
      expect(
        createHash("sha256")
          .update(await res.body())
          .digest("hex"),
      ).toBe(a.sha256);
    }
    await page.goto("/projects/" + f.project_id + "/pages/" + f.page_id);
    await expect(page.getByLabel("Markdown 正文")).toContainText("# 真实验收");
    await page.getByRole("button", { name: "预览", exact: true }).click();
    await expect(page.locator(".markdown-preview img")).toBeVisible();
    await expect(page.locator(".markdown-preview pre code")).toContainText(
      "fmt.Println",
    );
    await page.screenshot({
      path: "/tmp/noteapp-v1-restored.png",
      fullPage: true,
    });
  });
}
