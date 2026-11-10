import {setSort} from './sort-actions';
import {test,expect,type Page} from '@playwright/test';
import {DateTime} from 'luxon';
async function filter(page:Page,field:string,op:string,value?:string){
 await page.getByRole('button',{name:'筛选笔记',exact:true}).click();const panel=page.getByRole('dialog',{name:'添加筛选条件',exact:true});
 await panel.getByLabel('筛选属性',{exact:true}).selectOption(field);await panel.getByLabel('筛选条件',{exact:true}).selectOption(op);
 if(value!==undefined)await panel.getByLabel('筛选值',{exact:true}).fill(value);await panel.getByRole('button',{name:'应用筛选',exact:true}).click();
}
test('notes filter title and custom fields with sorting, history, project/type isolation and timestamps',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Note filters'}})).json();const other=await(await request.post('/api/v1/projects',{data:{title:'Other notes'}})).json();
 const a=await(await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'Alpha note'}})).json();await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'Beta note'}});
 let d=await(await request.post(`/api/v1/projects/${p.id}/property-definitions/pages`,{data:{kind:'text'}})).json();d=await(await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:d.version,name:'备注'}})).json();
 await request.put(`/api/v1/objects/pages/${a.id}/custom-properties/${d.id}`,{data:{version:0,definition_version:d.version,value:'Important'}});
 await page.goto(`/projects/${p.id}/pages`);await setSort(page,'笔记排序','title','desc');await expect(page.locator('.page-list-row a')).toHaveText(['Beta note','Alpha note']);await filter(page,'title','contains','Alpha');await filter(page,d.id,'contains','important');
 await expect(page.locator('.page-list-row a')).toHaveText(['Alpha note']);await expect(page.getByText('1 / 2 篇笔记符合条件',{exact:true})).toBeVisible();
 await page.locator('.page-list-row a').click();await page.getByRole('button',{name:'关闭笔记详情',exact:true}).click();await expect(page.locator('.page-list-row a')).toHaveText(['Alpha note']);
 await page.reload();await expect(page.getByRole('button',{name:/编辑筛选 备注/})).toBeVisible();
 await page.goto(`/projects/${p.id}/tasks`);await expect(page.getByRole('button',{name:/编辑筛选/})).toHaveCount(0);
 await page.goto(`/projects/${other.id}/pages`);await expect(page.getByRole('button',{name:/编辑筛选/})).toHaveCount(0);
 await page.goto(`/projects/${p.id}/pages`);await page.getByRole('button',{name:'清除全部',exact:true}).click();
 await filter(page,'created_at','before',DateTime.fromMillis(a.created_at,{zone:'Asia/Shanghai'}).toISODate()!);await expect(page.getByText(/没有符合条件的笔记/)).toBeVisible();await page.getByRole('button',{name:'清除筛选',exact:true}).click();
 await page.getByRole('button',{name:'筛选笔记',exact:true}).click();const panel=page.getByRole('dialog',{name:'添加筛选条件'});await expect(panel.getByLabel('筛选属性').locator('option')).not.toContainText(['阶段']);await panel.getByLabel('筛选属性').selectOption('updated_at');await page.getByRole('button',{name:'关闭筛选条件'}).click();
});

test('note custom snapshot failure and deleted definitions do not match empty; archive permits filtering',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Note filter recovery'}})).json();await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'A note'}});
 const d=await(await request.post(`/api/v1/projects/${p.id}/property-definitions/pages`,{data:{kind:'text'}})).json();
 await page.goto(`/projects/${p.id}/pages`);await filter(page,d.id,'empty');await expect(page.locator('.page-list-row a')).toHaveCount(1);
 await page.route(`**/projects/${p.id}/property-snapshot/pages`,r=>r.fulfill({status:500,json:{error:{message:'failed'}}}));await page.reload();await expect(page.getByRole('button',{name:'重试筛选',exact:true})).toBeVisible({timeout:15000});await expect(page.locator('.page-list-row a')).toHaveCount(0);
 await page.unroute(`**/projects/${p.id}/property-snapshot/pages`);await page.getByRole('button',{name:'重试筛选',exact:true}).click();await expect(page.locator('.page-list-row a')).toHaveCount(1);
 await request.delete(`/api/v1/property-definitions/${d.id}`,{data:{version:d.version}});await page.reload();await expect(page.getByRole('alert')).toContainText('失效');await page.getByRole('button',{name:'清除全部'}).click();
 await request.patch(`/api/v1/projects/${p.id}`,{data:{version:p.version,archived:true}});await page.reload();await expect(page.getByRole('button',{name:'新建笔记',exact:true})).toHaveCount(0);await filter(page,'title','contains','A');await expect(page.locator('.page-list-row a')).toHaveCount(1);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'筛选笔记'}).click();await page.screenshot({path:'/tmp/noteapp-note-filter-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('absolute note timestamp filters wait for timezone and use local date rather than UTC',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Note date zone'}})).json();
 await page.addInitScript(pid=>localStorage.setItem(`noteapp:page-filters:v1:${pid}`,JSON.stringify([{id:'date-rule',field:'created_at',op:'before',value:'2026-10-28'}])),p.id);
 await page.route(url=>url.pathname===`/api/v1/projects/${p.id}/pages`,route=>route.fulfill({json:[{id:'before',project_id:p.id,title:'Local October 27',position:0,version:1,created_at:Date.parse('2026-10-27T15:30:00Z')},{id:'after',project_id:p.id,title:'Local October 28',position:1,version:1,created_at:Date.parse('2026-10-27T16:30:00Z')}]}));
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/v1/config',async route=>{await gate;await route.continue();});
 try{await page.goto(`/projects/${p.id}/pages`);await expect(page.getByText('正在加载筛选数据…',{exact:true})).toBeVisible();await expect(page.locator('.page-list-row a')).toHaveCount(0);}finally{release();}
 await expect(page.locator('.page-list-row a')).toHaveText(['Local October 27']);
});
