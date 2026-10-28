import {test,expect} from '@playwright/test';

test('workbench day click creates in a selected active project and refreshes calendar',async({page,request})=>{
 const day=(await(await request.get('/api/v1/workspace/today')).json()).date;
 const p=await(await request.post('/api/v1/projects',{data:{title:'Workbench create'}})).json();
 const archived=await(await request.post('/api/v1/projects',{data:{title:'Archived choice'}})).json();await request.patch(`/api/v1/projects/${archived.id}`,{data:{version:archived.version,archived:true}});
 await page.goto('/');const calendar=page.getByRole('region',{name:'日程日历',exact:true});await calendar.locator(`.fc-daygrid-day[data-date="${day}"] .fc-daygrid-day-number`).click();
 const dialog=page.getByRole('dialog',{name:'新建日程',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('所属项目',{exact:true}).locator(`option[value="${archived.id}"]`)).toHaveCount(0);
 await dialog.getByLabel('所属项目',{exact:true}).selectOption(p.id);await expect(dialog.getByLabel('新日程开始',{exact:true})).toHaveValue(day+'T09:00');await expect(dialog.getByLabel('新日程结束',{exact:true})).toHaveValue(day+'T10:00');
 await dialog.getByLabel('新日程标题',{exact:true}).fill('Created from workbench');await expect(dialog).toBeHidden();
 const from=day+'T00:00:00+08:00',to=day+'T23:59:59+08:00';const rows=await(await request.get(`/api/v1/projects/${p.id}/events`,{params:{from,to}})).json();const matching=rows.filter((e:any)=>e.title==='Created from workbench');expect(matching).toHaveLength(1);expect(new Date(matching[0].start_at).toISOString()).toBe(day+'T01:00:00.000Z');
 const selector=`a[href="/projects/${p.id}/events/${matching[0].id}"]:visible`;
 const more=calendar.locator(`.fc-daygrid-day[data-date="${day}"] .fc-daygrid-more-link`);
 await expect.poll(async()=>await calendar.locator(selector).count()||await more.count()).toBeGreaterThan(0);
 if(await calendar.locator(selector).count()===0)await more.click();await expect(calendar.locator(selector).first()).toBeVisible();
 await expect(page).toHaveURL('/');
});

test('workbench creation locks pending input and retries a lost response without duplicates',async({page,request})=>{
 const day=(await(await request.get('/api/v1/workspace/today')).json()).date;
 const p=await(await request.post('/api/v1/projects',{data:{title:'Workbench retry'}})).json();
 await page.goto('/');await page.getByRole('region',{name:'日程日历'}).locator(`.fc-daygrid-day[data-date="${day}"] .fc-daygrid-day-number`).click();
 const dialog=page.getByRole('dialog',{name:'新建日程',exact:true});await dialog.getByLabel('所属项目',{exact:true}).selectOption(p.id);
 let first=true;await page.route(`**/api/v1/projects/${p.id}/events`,async route=>{if(route.request().method()==='POST'&&first){first=false;await route.fetch();await route.abort();}else await route.continue();});
 await dialog.getByLabel('新日程标题',{exact:true}).fill('Retry workbench event');await expect(dialog.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();await expect(dialog.getByLabel('新日程标题',{exact:true})).toBeDisabled();
 const current=await(await request.get(`/api/v1/projects/${p.id}`)).json();await request.patch(`/api/v1/projects/${p.id}`,{data:{version:current.version,archived:true}});
 await page.evaluate(()=>{dispatchEvent(new Event('offline'));dispatchEvent(new Event('online'));});
 await expect(dialog.getByLabel('所属项目',{exact:true}).locator(`option[value="${p.id}"]`)).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'重试保存',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'重试保存',exact:true}).click();await expect(dialog).toBeHidden();
 const rows=await(await request.get(`/api/v1/projects/${p.id}/events`,{params:{from:day+'T00:00:00+08:00',to:day+'T23:59:59+08:00'}})).json();expect(rows.filter((e:any)=>e.title==='Retry workbench event')).toHaveLength(1);
});

test('workbench week time click preserves the clicked time and invalid drafts remain open',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Workbench week'}})).json();await page.goto('/');const calendar=page.getByRole('region',{name:'日程日历',exact:true});await calendar.locator('.fc-timeGridWeek-button').click();
 const lane=calendar.locator('.fc-timegrid-col[data-date]').first();await lane.scrollIntoViewIfNeeded();
 // Trigger a real pointer click in a time-grid lane; no direct component invocation.
 const box=(await lane.boundingBox())!;await page.mouse.click(box.x+Math.min(15,box.width/2),box.y+80);
 const dialog=page.getByRole('dialog',{name:'新建日程',exact:true});await expect(dialog).toBeVisible();await dialog.getByLabel('所属项目',{exact:true}).selectOption(p.id);
 const start=await dialog.getByLabel('新日程开始',{exact:true}).inputValue();const end=await dialog.getByLabel('新日程结束',{exact:true}).inputValue();expect(Date.parse(end)-Date.parse(start)).toBe(1800000);
 await dialog.getByLabel('新日程结束',{exact:true}).fill(start);await dialog.getByLabel('新日程标题',{exact:true}).fill('Invalid draft');await expect(dialog.getByRole('alert')).toContainText('结束时间必须晚于开始时间');
 await expect(dialog).toBeVisible();page.on('dialog',d=>d.accept());await dialog.getByRole('button',{name:'关闭新建日程',exact:true}).click();await expect(dialog).toBeHidden();
 const response=await request.get(`/api/v1/projects/${p.id}/events`,{params:{from:'2026-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z'}});expect(await response.json()).toEqual([]);
});
