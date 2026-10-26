import {expect,type Page} from '@playwright/test';
export async function openObjectDelete(page: Page) {
  await page.getByRole('button',{name:'对象菜单',exact:true}).click();
  await page.getByRole('group',{name:'对象操作',exact:true}).getByRole('button',{name:'移入回收站',exact:true}).click();
}

export async function closeObject(page:Page){
 const deletion=page.locator('dialog.delete-dialog[open]');
 if(await deletion.count())await expect(deletion).toHaveCount(0);
 const dialog=page.locator('dialog.object-dialog[open]');
 if(await dialog.count()){await dialog.getByRole('button',{name:/^关闭(任务|笔记|日程)详情$/}).click();await expect(dialog).toHaveCount(0);}
}
