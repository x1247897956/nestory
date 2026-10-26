import {expect,type Page} from '@playwright/test';
import {expandProperties} from './property-actions';
export async function openOption(page:Page,property:string,name:string){
 await expandProperties(page);
 const field=page.getByRole('group',{name:`自定义属性 ${property}`,exact:true});
 if(!await field.getByLabel('搜索或创建选项',{exact:true}).isVisible())await page.getByLabel(`属性值 ${property}`,{exact:true}).click();
 await page.getByRole('option',{name,exact:true}).hover();
 await page.getByRole('button',{name:`设置选项 ${name}`,exact:true}).click();
 const settings=page.getByRole('region',{name:'选项设置',exact:true});await expect(settings).toBeVisible();return settings;
}
export async function closeOptions(page:Page){
 const option=page.locator('.option-settings-popover:popover-open');if(await option.count())await page.keyboard.press('Escape');
 if(await page.locator('.property-choice:popover-open').count())await page.keyboard.press('Escape');
}
