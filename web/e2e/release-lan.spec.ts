import { assertReleaseFixture } from './release-fixture';
import { test, expect, type Browser, type Playwright } from '@playwright/test';

const origin = 'http://lan.noteapp.test:18187';
test.skip(process.env.NOTEAPP_RELEASE_AUDIT !== '1', 'Opt-in LAN regressions against the disposable audit container');
test.beforeEach(async ({ baseURL }) => {
 assertReleaseFixture(baseURL);
});
async function lanBrowser(playwright: Playwright): Promise<Browser> {
  return playwright.chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--host-resolver-rules=MAP lan.noteapp.test 127.0.0.1', '--proxy-server=direct://'],
  });
}
for (const kind of ['tasks', 'pages', 'events'] as const) {
  test(`LAN HTTP ${kind}: forced-close draft explicitly recovers and saves`, async ({ playwright, request }) => {
    const browser = await lanBrowser(playwright);
    try {
      const projectResponse = await request.post('/api/v1/projects', { data: { title: `LAN recovery ${kind}` } });
      expect(projectResponse.status()).toBe(201);
      const project = await projectResponse.json();
      const createResponse = await request.post(`/api/v1/projects/${project.id}/${kind}`, {
        data: { title: `LAN ${kind}`, ...(kind === 'events' ? { start_at: '2026-10-25T01:00:00Z', end_at: '2026-10-25T02:00:00Z' } : {}) },
      });
      expect(createResponse.status()).toBe(201);
      const object = await createResponse.json();
      const context = await browser.newContext();
      const page = await context.newPage();
      const destination = `${origin}/projects/${project.id}/${kind}/${object.id}`;
      const endpoint = `/api/v1/${kind}/${object.id}`;
      await page.route(`**${endpoint}`, async route => {
        if (route.request().method() === 'PATCH') await route.abort('failed');
        else await route.continue();
      });
      await page.goto(destination);
      expect(await page.evaluate(() => isSecureContext)).toBe(false);
      expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
      const text = `LAN retained ${kind} 中文草稿`;
      await page.getByRole('textbox', { name: 'Markdown 正文', exact: true }).fill(text);
      await expect(page.getByRole('button', { name: '重试保存', exact: true })).toBeVisible();
      expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('noteapp:draft:')))).toBe(true);
      const oldOwner = await page.evaluate(() => sessionStorage.getItem('noteapp:tab-owner:v1'));
      await page.close({ runBeforeUnload: false });
      const restored = await context.newPage();
      await restored.goto(destination);
      const editor = restored.getByRole('textbox', { name: 'Markdown 正文', exact: true });
      await expect(editor).toContainText(text);
      expect(await restored.evaluate(() => sessionStorage.getItem('noteapp:tab-owner:v1'))).not.toBe(oldOwner);
      await restored.getByRole('button', { name: '恢复本机草稿', exact: true }).click();
      await expect(restored.getByRole('status')).toHaveText('已保存');
      await expect.poll(async () => JSON.stringify((await (await request.get(endpoint)).json()).body_document)).toContain(text);
      await restored.reload();
      await expect(editor).toContainText(text);
      await expect(restored.getByRole('button', { name: '恢复本机草稿', exact: true })).toHaveCount(0);
    } finally { await browser.close(); }
  });
}

test('LAN HTTP cloned window name and sessionStorage acquire distinct owners and create independently', async ({ playwright, request }) => {
  const browser = await lanBrowser(playwright);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(origin);
    await expect(page.getByRole('button', { name: '新建项目', exact: true })).toBeVisible();
    expect(await page.evaluate(() => isSecureContext)).toBe(false);
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
    const title = `LAN cloned independent ${Date.now()}`;
    let requestId: string | undefined;
    await page.route('**/api/v1/projects', async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      requestId = route.request().postDataJSON().request_id;
      // Playwright's Node fetch does not share Chromium's resolver mapping.
      // Connect to loopback while preserving the real LAN Host and Origin.
      const response = await route.fetch({
        url: 'http://127.0.0.1:18187/api/v1/projects',
        headers: { ...route.request().headers(), host: 'lan.noteapp.test:18187' },
      });
      await gate;
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill(title);
    await page.getByRole('button', { name: '保存项目', exact: true }).click();
    await expect.poll(() => requestId).toBeTruthy();
    const opened = page.waitForEvent('popup');
    await page.evaluate(() => {
      // A same-origin popup inherits the opener's sessionStorage; clone window.name too.
      const popup = window.open('about:blank', '_blank')!;
      popup.name = window.name;
      popup.location.href = location.origin + '/';
    });
    const other = await opened;
    await expect(other.getByRole('button', { name: '新建项目', exact: true })).toBeVisible();
    const firstOwner = await page.evaluate(() => sessionStorage.getItem('noteapp:tab-owner:v1'));
    const secondOwner = await other.evaluate(() => sessionStorage.getItem('noteapp:tab-owner:v1'));
    expect(firstOwner).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondOwner).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondOwner).not.toBe(firstOwner);
    expect(await other.evaluate(() => window.name)).not.toBe(await page.evaluate(() => window.name));
    await other.getByRole('button', { name: '新建项目', exact: true }).click();
    await other.getByLabel('项目名称', { exact: true }).fill(title);
    await other.getByRole('button', { name: '保存项目', exact: true }).click();
    await expect(other).toHaveURL(/\/projects\/[a-f0-9]+$/);
    release();
    await expect(page).toHaveURL(/\/projects\/[a-f0-9]+$/);
    expect(other.url()).not.toBe(page.url());
    const projects = await (await request.get('/api/v1/projects')).json();
    expect(projects.filter((project: { title: string }) => project.title === title)).toHaveLength(2);
  } finally { release(); await browser.close(); }
});
