import {setSort,expectSort} from './sort-actions';
import {test,expect,type APIRequestContext} from '@playwright/test';
async function project(request:APIRequestContext,title:string){return (await(await request.post('/api/v1/projects',{data:{title}})).json());}
async function task(request:APIRequestContext,pid:string,title:string,due_date?:string){return (await(await request.post(`/api/v1/projects/${pid}/tasks`,{data:{title,due_date}})).json());}

test('task sorting, grouping and stage folds persist by project and folded stages accept drops',async({page,request})=>{
 const p=await project(request,'View settings A'),other=await project(request,'View settings B');
 const early=await task(request,p.id,'Early','2026-11-02');await task(request,p.id,'Late','2026-11-20');await task(request,p.id,'Undated');
 await page.goto(`/projects/${p.id}/tasks`);
 await setSort(page,'任务排序','due_date','desc');
 await expect(page.locator('.task-row .task-title')).toHaveText(['Late','Early','Undated']);
 await page.getByRole('button',{name:'收起Todo阶段',exact:true}).click();
 await expect(page.getByRole('button',{name:'Early',exact:true})).toBeHidden();
 await page.reload();await expect(page.getByRole('button',{name:'展开Todo阶段',exact:true})).toHaveAttribute('aria-expanded','false');
 await expectSort(page,'任务排序','due_date','desc');
 await page.getByRole('button',{name:'展开Todo阶段',exact:true}).click();
 await page.getByRole('button',{name:'收起Done阶段',exact:true}).click();
 await page.getByRole('button',{name:'拖动任务 Early',exact:true}).dragTo(page.getByRole('region',{name:'Done阶段',exact:true}));
 await expect(page.getByRole('region',{name:'Done阶段',exact:true}).getByRole('button',{name:'Early',exact:true})).toBeVisible();
 await expect.poll(async()=>(await(await request.get(`/api/v1/tasks/${early.id}`)).json()).stage).toBe('done');
 await page.getByRole('button',{name:'任务显示设置',exact:true}).click();await page.getByRole('button',{name:'全部收起',exact:true}).click();
 await expect(page.locator('.task-group-content:not([hidden])')).toHaveCount(0);
 await page.keyboard.press('Escape');
 await page.goto(`/projects/${other.id}/tasks`);await expectSort(page,'任务排序','position');await expect(page.getByRole('button',{name:'收起Todo阶段',exact:true})).toBeVisible();
 await page.goto(`/projects/${p.id}/tasks`);await expect(page.getByRole('button',{name:'展开Done阶段',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'任务显示设置',exact:true}).click();await page.getByRole('checkbox',{name:'按阶段分组',exact:true}).uncheck();await page.keyboard.press('Escape');
 await expect(page.getByRole('region',{name:'Todo阶段',exact:true})).toHaveCount(0);await page.reload();await expect(page.getByRole('region',{name:'Todo阶段',exact:true})).toHaveCount(0);
});

test('note sorting persists through centered detail and matches shared editor structure',async({page,request})=>{
 const p=await project(request,'Note sort');
 for(const title of ['Z note','A note'])await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title}});
 await page.goto(`/projects/${p.id}/pages`);await setSort(page,'笔记排序','title');
 await expect(page.locator('.page-list-row a')).toHaveText(['A note','Z note']);await page.locator('.page-list-row a').first().click();
 const dialog=page.getByRole('dialog',{name:'笔记详情',exact:true});await expect(dialog.locator('.object-editor-header .object-property-section')).toHaveCount(1);await expect(dialog.locator('.object-editor-body')).toBeVisible();await expect(dialog.locator('.object-editor-footer')).toBeVisible();
 await page.getByRole('button',{name:'关闭笔记详情',exact:true}).click();await page.reload();await expectSort(page,'笔记排序','title');
 await expect(page.locator('.page-list-row a')).toHaveText(['A note','Z note']);
});

test('event timeline remembers range and zoom, opens shared details and remains readable on a phone',async({page,request})=>{
 const p=await project(request,'Timeline settings'),other=await project(request,'Timeline other');
 // Seed preference only to make the test independent of today's date.
 await page.addInitScript(pid=>{const key=`noteapp:view:${pid}:events`;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({view:'timeline',date:'2026-11-15',span:'week',calendarView:'dayGridMonth',sort:{field:'start_at',direction:'asc'}}));},p.id);
 const e=await(await request.post(`/api/v1/projects/${p.id}/events`,{data:{title:'Cross day event',start_at:'2026-11-12T01:00:00Z',end_at:'2026-11-14T10:00:00Z'}})).json();
 await page.goto(`/projects/${p.id}/events`);await expect(page.getByRole('button',{name:'时间轴',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.timeline-bar')).toHaveCount(1);await page.locator('.timeline-bar').click();
 const dialog=page.getByRole('dialog',{name:'日程详情',exact:true});await expect(dialog.locator('.object-editor-header .object-property-section')).toHaveCount(1);await expect(dialog.locator('.object-editor-footer')).toBeVisible();await page.getByRole('button',{name:'关闭日程详情',exact:true}).click();
 await setSort(page,'排序','title');await page.getByRole('button',{name:'月',exact:true}).click();await expect(page.getByRole('button',{name:'月',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'下一区间',exact:true}).click();
 await expect(page.getByText('此区间暂无日程',{exact:true})).toBeVisible();
 const stored=await page.evaluate(pid=>localStorage.getItem(`noteapp:view:${pid}:events`),p.id);
 expect(JSON.parse(stored!).date).toBe('2026-12-01');
 await page.goto(`/projects/${other.id}/events`);await expect(page.getByRole('button',{name:'日历',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.goto(`/projects/${p.id}/events`);await expect(page.getByRole('button',{name:'时间轴',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();await expectSort(page,'排序','title');await expect(page.locator('.timeline-toolbar h2')).toContainText('2026年12月');
 await page.getByRole('button',{name:'上一区间',exact:true}).click();await expect(page.locator('.timeline-bar')).toHaveCount(1);await page.screenshot({path:'/tmp/noteapp-timeline-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/noteapp-timeline-mobile.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 expect((await(await request.get(`/api/v1/events/${e.id}`)).json()).start_at).toBe('2026-11-12T01:00:00Z');
});

test('saved calendar date and week view survive reload and project switches',async({page,request})=>{
 const p=await project(request,'Saved week'),other=await project(request,'Other month');
 await page.goto(`/projects/${p.id}/events`);
 await page.locator('.fc-timeGridWeek-button').click();await page.locator('.fc-next-button').click();
 const title=await page.locator('.fc-toolbar-title').textContent();
 await page.reload();await expect(page.locator('.fc-timeGridWeek-button')).toHaveClass(/fc-button-active/);await expect(page.locator('.fc-toolbar-title')).toHaveText(title!);
 await page.goto(`/projects/${other.id}/events`);await expect(page.locator('.fc-dayGridMonth-button')).toHaveClass(/fc-button-active/);
 await page.goto(`/projects/${p.id}/events`);await expect(page.locator('.fc-timeGridWeek-button')).toHaveClass(/fc-button-active/);await expect(page.locator('.fc-toolbar-title')).toHaveText(title!);
});

test('saved timeline waits for app timezone and archived projects retain view controls without writes',async({page,request})=>{
 const p=await project(request,'Archived timeline');
 await request.post(`/api/v1/projects/${p.id}/events`,{data:{title:'Read-only event',start_at:'2026-11-01T16:30:00Z',end_at:'2026-11-02T01:30:00Z'}});
 const current=await(await request.get(`/api/v1/projects/${p.id}`)).json();await request.patch(`/api/v1/projects/${p.id}`,{data:{version:current.version,archived:true}});
 await page.addInitScript(pid=>localStorage.setItem(`noteapp:view:${pid}:events`,JSON.stringify({view:'timeline',date:'2026-11-02',span:'week',sort:{field:'start_at',direction:'asc'}})),p.id);
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/v1/config',async route=>{await gate;await route.continue();});
 const reads:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname===`/api/v1/projects/${p.id}/events`)reads.push(r.url());});
 await page.goto(`/projects/${p.id}/events`);await expect(page.getByText('加载日历…',{exact:true})).toBeVisible();expect(reads).toHaveLength(0);release();
 await expect(page.locator('.timeline-bar')).toHaveCount(1);expect(new URL(reads[0]).searchParams.get('from')).toBe('2026-11-02T00:00:00.000+08:00');
 await expect(page.getByRole('button',{name:'新建日程',exact:true})).toHaveCount(0);await page.locator('.timeline-bar').click();await expect(page.getByLabel('日程标题',{exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'关闭日程详情',exact:true}).click();await page.getByRole('button',{name:'月',exact:true}).click();await expect(page.getByRole('button',{name:'月',exact:true})).toHaveAttribute('aria-pressed','true');
});
