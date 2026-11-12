import { assertReleaseFixture } from './release-fixture';
import { archiveCurrentProject } from "./project-actions";
// Schema regressions may write only to the disposable release audit instance.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const corpus = JSON.parse(readFileSync(new URL('../../internal/document/testdata/blocknote-0.56.0.json', import.meta.url), 'utf8'));

test.skip(process.env.NOTEAPP_RELEASE_AUDIT !== '1', 'Opt-in release regressions; use the isolated audit runner');
test.beforeEach(async ({ baseURL }) => {
 assertReleaseFixture(baseURL);
});

for (const kind of ['tasks', 'pages', 'events'] as const) {
  test(`${kind}: pinned schema corpus reopens unchanged, including archived read-only view`, async ({ page, request }) => {
    const projectResponse = await request.post('/api/v1/projects', { data: { title: `Schema corpus ${kind}` } });
    expect(projectResponse.status()).toBe(201);
    const project = await projectResponse.json();
    const createResponse = await request.post(`/api/v1/projects/${project.id}/${kind}`, {
      data: { title: 'Complete pinned schema corpus', ...(kind === 'events' ? { start_at: '2026-10-25T01:00:00Z', end_at: '2026-10-25T02:00:00Z' } : {}) },
    });
    expect(createResponse.status()).toBe(201);
    const object = await createResponse.json();
    const endpoint = `/api/v1/${kind}/${object.id}`;
    const patch = await request.patch(endpoint, { data: { version: object.version, body_document: corpus } });
    expect(patch.status()).toBe(200);
    expect((await patch.json()).body_document).toEqual(corpus);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const destination = `/projects/${project.id}/${kind}/${object.id}`;
    const editor = page.getByRole('textbox', { name: 'Markdown 正文', exact: true });
    const assertUnchanged = async () => {
      await expect(page.getByRole('alert').filter({ hasText: '正文加载失败' })).toHaveCount(0);
      await expect(editor).toBeVisible();
      // Initialization has enough time to trigger any unintended debounced save.
      await page.waitForTimeout(800);
      const saved = await request.get(endpoint);
      expect(saved.status()).toBe(200);
      expect((await saved.json()).body_document).toEqual(corpus);
      expect(errors).toEqual([]);
    };
    await page.goto(destination);
    await assertUnchanged();
    await page.reload();
    await assertUnchanged();
    await archiveCurrentProject(page);
    await expect(page.getByText('此项目已归档，内容只读。取消归档后可继续编辑。', { exact: true })).toBeVisible();
    await assertUnchanged();
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    await page.reload();
    await assertUnchanged();
    await expect(editor).toHaveAttribute('contenteditable', 'false');
  });
}
