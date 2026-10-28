import {expect,type Page} from '@playwright/test';
export async function setSort(page:Page,label:string,field:string,direction?:'asc'|'desc'){
 await page.getByRole('button',{name:`${label}器`,exact:true}).click();
 const panel=page.getByRole('dialog',{name:'排序条件',exact:true});
 await panel.getByLabel(`${label}字段`,{exact:true}).selectOption(field);
 if(direction)await panel.getByLabel(`${label}方向`,{exact:true}).selectOption(direction);
 await panel.getByRole('button',{name:'应用排序',exact:true}).click();
}
export async function expectSort(page:Page,label:string,field:string,direction?:string){
 await page.getByRole('button',{name:`${label}器`,exact:true}).click();
 const panel=page.getByRole('dialog',{name:'排序条件',exact:true});
 await expect(panel.getByLabel(`${label}字段`,{exact:true})).toHaveValue(field);
 if(direction)await expect(panel.getByLabel(`${label}方向`,{exact:true})).toHaveValue(direction);
 await panel.getByRole('button',{name:'取消',exact:true}).click();
}
