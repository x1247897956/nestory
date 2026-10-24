import type { Page } from "@playwright/test";
export async function importMarkdown(page: Page, source: string) {
  await page.getByLabel("Markdown 正文").fill("");
  await page
    .getByLabel("导入 Markdown", { exact: true })
    .setInputFiles({
      name: "正文.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(source),
    });
}
