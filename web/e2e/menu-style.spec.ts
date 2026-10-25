import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`project menu and deletion use separate consistent surfaces at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const project = await (await request.post('/api/v1/projects', { data: { title: `菜单样式 ${width}` } })).json();
    const parent = await (await request.post(`/api/v1/projects/${project.id}/tasks`, { data: { title: '整理项目资料' } })).json();
    await request.post(`/api/v1/projects/${project.id}/tasks`, { data: { title: '补充相关参考资料与附件'.repeat(7), parent_id: parent.id } });
    await request.post(`/api/v1/projects/${project.id}/pages`, { data: { title: '项目笔记' } });
    await page.goto(`/projects/${project.id}`);
    const trigger = page.locator(`button[popovertarget="project-menu-${project.id}"]`);
    await trigger.click();
    const menu = page.locator(`#project-menu-${project.id}`);
    await expect(menu).toBeVisible();
    expect((await menu.boundingBox())!.width).toBeLessThanOrEqual(220);
    if (width === 1280) await page.screenshot({ path: '/tmp/noteapp-project-menu-polished.png' });
    await menu.getByRole('button', { name: '删除', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '确认删除' });
    await expect(dialog).toBeVisible();
    await expect(menu).toBeHidden();
    await expect(dialog).toContainText('共 4 个对象');
    await expect(dialog.getByRole('listitem')).toHaveCount(4);
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
    expect(await dialog.evaluate(node => node.parentElement === document.body)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `/tmp/noteapp-delete-dialog-${width}.png` });
    if (width === 1280) await dialog.screenshot({ path: '/tmp/noteapp-delete-dialog-detail.png' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect((await request.get(`/api/v1/projects/${project.id}`)).status()).toBe(200);
  });
}

test('deletion confirmation stays open during a pending delete', async ({ page, request }) => {
  const project = await (await request.post('/api/v1/projects', { data: { title: '删除处理中' } })).json();
  await page.goto(`/projects/${project.id}`);
  await page.locator(`button[popovertarget="project-menu-${project.id}"]`).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '确认删除' });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/v1/projects/${project.id}`, async route => {
    if (route.request().method() !== 'DELETE') { await route.continue(); return; }
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await dialog.getByRole('button', { name: '确认删除 1 个对象', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '正在移入回收站…' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
    release();
    await expect(page).toHaveURL('/');
    await expect(dialog).toHaveCount(0);
  } finally { release(); }
});

test('a failed conflict refresh keeps the error in the dialog and blocks stale confirmation', async ({ page, request }) => {
  const project = await (await request.post('/api/v1/projects', { data: { title: '预览刷新失败' } })).json();
  await page.goto(`/projects/${project.id}`);
  await page.locator(`button[popovertarget="project-menu-${project.id}"]`).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '确认删除' });
  await expect(dialog).toBeVisible();
  await page.route(`**/api/v1/projects/${project.id}`, async route => {
    if (route.request().method() === 'DELETE') await route.fulfill({ status: 409, json: { error: { code: 'conflict', message: '内容发生变化' } } });
    else await route.continue();
  });
  await page.route(`**/api/v1/projects/${project.id}/delete-preview`, route => route.fulfill({ status: 500, json: { error: { code: 'internal', message: '预览不可用' } } }));
  await dialog.getByRole('button', { name: '确认删除 1 个对象', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('无法刷新删除预览，请取消后重试。');
  await expect(dialog.getByRole('button', { name: '确认删除 1 个对象', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await request.get(`/api/v1/projects/${project.id}`)).status()).toBe(200);
});
