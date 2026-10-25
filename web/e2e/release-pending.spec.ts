// Release regressions run exclusively against the disposable audit instance.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test.skip(process.env.NOTEAPP_RELEASE_AUDIT !== '1', 'Opt-in release regressions; use the isolated audit runner');
test.beforeEach(async ({ baseURL }) => {
  expect(new URL(baseURL!).port).toBe('18187');
  const name = process.env.NOTEAPP_AUDIT_CONTAINER;
  expect(name?.startsWith('noteapp-release-audit-')).toBe(true);
  const info = JSON.parse(execFileSync('docker', ['inspect', name!], { encoding: 'utf8' }))[0];
  expect(info.NetworkSettings.Ports['8080/tcp'][0].HostPort).toBe('18187');
  expect(info.Mounts.some((mount: { Name: string; Destination: string }) => mount.Name === name && mount.Destination === '/data')).toBe(true);
});

for (const kind of ['tasks', 'pages', 'events'] as const) {
  for (const mode of ['upload', 'import', 'save'] as const) {
    test(`${kind}: recovery preserves ${mode} in progress`, async ({ page, request }) => {
      const projectResponse = await request.post('/api/v1/projects', { data: { title: `Pending ${kind} ${mode}` } });
      expect(projectResponse.status()).toBe(201);
      const project = await projectResponse.json();
      const createResponse = await request.post(`/api/v1/projects/${project.id}/${kind}`, {
        data: { title: 'Original title', ...(kind === 'events' ? { start_at: '2026-10-25T01:00:00Z', end_at: '2026-10-25T02:00:00Z' } : {}) },
      });
      expect(createResponse.status()).toBe(201);
      const object = await createResponse.json();
      const endpoint = `/api/v1/${kind}/${object.id}`;
      const destination = `/projects/${project.id}/${kind}/${object.id}`;
      await page.goto(destination);
      const editor = page.getByRole('textbox', { name: 'Markdown 正文', exact: true });
      await expect(editor).toBeVisible();
      let failSave = true;
      let holdSave = false;
      let saveStarted = false;
      let reloadReads = 0;
      let releaseSave!: () => void;
      const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
      await page.route(`**${endpoint}`, async route => {
        if (route.request().method() !== 'PATCH') { reloadReads++; await route.continue(); return; }
        if (failSave) { await route.abort(); return; }
        if (holdSave) { saveStarted = true; await saveGate; }
        await route.continue();
      });
      const titleLabel = kind === 'tasks' ? '任务标题' : kind === 'pages' ? '笔记标题' : '日程标题';
      await page.getByLabel(titleLabel, { exact: true }).fill(`Retained ${mode}`);
      const reload = page.getByRole('button', { name: '重新载入', exact: true });
      await expect(reload).toBeVisible();
      await editor.evaluate(element => { (window as any).__pendingEditor = element; });
      let dialogs = 0;
      page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
      let asset: { id: string } | undefined;
      let releaseUpload!: () => void;
      const uploadGate = new Promise<void>(resolve => { releaseUpload = resolve; });
      try {
        if (mode === 'upload') {
          await page.route('**/api/v1/projects/*/assets', async route => {
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            asset = await response.json();
            await uploadGate;
            await route.fulfill({ response });
          });
          await page.getByLabel('上传附件', { exact: true }).setInputFiles({ name: 'pending.txt', mimeType: 'text/plain', buffer: Buffer.from('pending attachment bytes') });
          await expect.poll(() => Boolean(asset)).toBe(true);
        } else if (mode === 'import') {
          await page.evaluate(() => {
            const original = File.prototype.text;
            File.prototype.text = async function () {
              if (this.name === 'pending.md') await new Promise<void>(resolve => { (window as any).__releasePendingImport = resolve; });
              return original.call(this);
            };
          });
          await page.getByLabel('导入 Markdown', { exact: true }).setInputFiles({ name: 'pending.md', mimeType: 'text/markdown', buffer: Buffer.from('Retained imported body') });
          await expect.poll(() => page.evaluate(() => typeof (window as any).__releasePendingImport)).toBe('function');
        } else {
          failSave = false;
          holdSave = true;
          await page.getByRole('button', { name: '重试保存', exact: true }).click();
          await expect.poll(() => saveStarted).toBe(true);
        }
        if (mode !== 'save') await expect(page.getByText('正在处理文件…', { exact: true })).toBeVisible();
        // Recovery may disappear when a retry clears the error; any visible control must be disabled.
        if (await reload.count()) {
          await expect(reload).toBeDisabled();
          await reload.evaluate((element: HTMLButtonElement) => element.click());
        }
        const recover = page.getByRole('button', { name: '恢复本机草稿', exact: true });
        if (await recover.count()) await expect(recover).toBeDisabled();
        expect(dialogs).toBe(0);
        expect(reloadReads).toBe(0);
        expect(await editor.evaluate(element => element === (window as any).__pendingEditor)).toBe(true);
        failSave = false;
        if (mode === 'upload') releaseUpload();
        else if (mode === 'import') await page.evaluate(() => (window as any).__releasePendingImport());
        else releaseSave();
        if (mode !== 'save') {
          await expect(page.getByText('正在处理文件…', { exact: true })).toBeHidden();
          await page.getByRole('button', { name: '重试保存', exact: true }).click();
        }
        await expect.poll(async () => {
          const result = await (await request.get(endpoint)).json();
          const body = JSON.stringify(result.body_document);
          return result.title === `Retained ${mode}` && (mode === 'upload' ? body.includes(asset!.id) : mode === 'import' ? body.includes('Retained imported body') : true);
        }).toBe(true);
        if (asset) expect((await request.get(`/api/v1/assets/${asset.id}`)).status()).toBe(200);
        await expect(page.getByRole('status')).toContainText('已保存');
        await page.reload();
        await expect(page.getByLabel(titleLabel, { exact: true })).toHaveValue(`Retained ${mode}`);
        await expect(editor).toBeVisible();
        if (mode === 'import') await expect(editor).toContainText('Retained imported body');
        if (mode === 'upload') await expect(page.getByText('pending.txt', { exact: true }).first()).toBeVisible();
      } finally {
        releaseUpload();
        releaseSave();
        await page.evaluate(() => (window as any).__releasePendingImport?.()).catch(() => {});
      }
    });
  }
}
