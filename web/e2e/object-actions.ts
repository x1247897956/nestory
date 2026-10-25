import type { Page } from '@playwright/test';
export async function openObjectDelete(page: Page) {
  await page.getByRole('button',{name:'对象菜单',exact:true}).click();
  await page.getByRole('group',{name:'对象操作',exact:true}).getByRole('button',{name:'移入回收站',exact:true}).click();
}
