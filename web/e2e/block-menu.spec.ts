import { test, expect } from '@playwright/test';
import { block, documentOf } from './block-fixtures';

test('closing side menu removes inert handles before quick mouse reopen and block copy', async ({ page, request }) => {
  const project = await (await request.post('/api/v1/projects', { data: { title: 'Menu transition regression' } })).json();
  const object = await (await request.post(`/api/v1/projects/${project.id}/pages`, {
    data: { title: 'Mouse actions', body_document: documentOf(block('heading', 'Mouse target', { level: 2 }), block('paragraph', 'Other content')) },
  })).json();
  await page.goto(`/projects/${project.id}/pages/${object.id}`);
  const editor = page.getByRole('textbox', { name: 'Markdown 正文', exact: true });
  const heading = editor.getByRole('heading', { name: 'Mouse target', exact: true });
  const handle = page.getByRole('button', { name: '打开菜单', exact: true });
  await heading.hover();
  await expect(handle).toBeVisible();
  // Move outside the editor, then allow React and the zero-duration close to commit.
  // A 250ms closing transition leaves an inert dangerouslySetInnerHTML handle here.
  await page.mouse.move(5, 5);
  const remainingHandles = await page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return document.querySelectorAll('.block-handle').length;
  });
  expect(remainingHandles).toBe(0);
  await heading.hover();
  await handle.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitem', { name: '复制块', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Mouse target', exact: true })).toHaveCount(2);
  await expect(page.getByRole('status')).toHaveText('已保存');
});
