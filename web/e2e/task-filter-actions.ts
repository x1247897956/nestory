import {type Page} from '@playwright/test';
export async function addTaskFilter(page:Page,field:string,op:string,value?:string){
 await page.getByRole('button',{name:'筛选任务',exact:true}).click();
 const popup=page.getByRole('dialog',{name:'添加筛选条件',exact:true});
 await popup.getByLabel('筛选属性',{exact:true}).selectOption(field);
 await popup.getByLabel('筛选条件',{exact:true}).selectOption(op);
 if(value!==undefined){const input=popup.getByLabel('筛选值',{exact:true});if(await input.evaluate(e=>e.tagName==='SELECT'))await input.selectOption(value);else await input.fill(value);}
 await popup.getByRole('button',{name:'应用筛选',exact:true}).click();
}
