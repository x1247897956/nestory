import {test,expect} from '@playwright/test';
import {addTaskFilter} from './task-filter-actions';
test('filter chips combine defaults and custom fields, survive views and refresh, and isolate projects',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Filters A'}})).json();
 const other=await(await request.post('/api/v1/projects',{data:{title:'Filters B'}})).json();
 const a=await(await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'Match task',priority:'high'}})).json();
 await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'Other task',priority:'low'}});
 let d=await(await request.post(`/api/v1/projects/${p.id}/property-definitions/tasks`,{data:{kind:'text'}})).json();
 d=await(await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:d.version,name:'备注'}})).json();
 await request.put(`/api/v1/objects/tasks/${a.id}/custom-properties/${d.id}`,{data:{version:0,definition_version:d.version,value:'Important'}});
 await page.goto(`/projects/${p.id}/tasks`);
 await addTaskFilter(page,'priority','is','high');
 await expect(page.getByRole('button',{name:'Match task',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Other task',exact:true})).toHaveCount(0);
 await addTaskFilter(page,d.id,'contains','important');
 await expect(page.getByText('1 / 2 个任务符合条件',{exact:true})).toBeVisible();
 await page.getByRole('group',{name:'任务视图',exact:true}).getByRole('button',{name:'看板',exact:true}).click();
 await expect(page.getByRole('button',{name:'打开任务 Match task',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'打开任务 Other task',exact:true})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('button',{name:/编辑筛选 备注/})).toBeVisible();
 await page.goto(`/projects/${other.id}/tasks`);await expect(page.getByRole('button',{name:/编辑筛选/})).toHaveCount(0);
 await page.goto(`/projects/${p.id}/tasks`);
 await page.getByRole('button',{name:/编辑筛选 备注/}).click();
 await page.getByRole('dialog',{name:'编辑筛选条件'}).getByLabel('筛选值',{exact:true}).fill('missing');
 await page.getByRole('button',{name:'应用筛选',exact:true}).click();
 await expect(page.getByText('没有符合条件的任务',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'清除筛选',exact:true}).click();
 await expect(page.getByRole('button',{name:'打开任务 Other task',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'筛选任务'}).click();
 await page.screenshot({path:'/tmp/noteapp-filter-mobile.png'});
 const box=await page.getByRole('dialog',{name:'添加筛选条件'}).boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);
});

test('invalid definitions and failed custom reads do not silently match empty values',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Filter errors'}})).json();
 await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'Visible after clear'}});
 const d=await(await request.post(`/api/v1/projects/${p.id}/property-definitions/tasks`,{data:{kind:'text'}})).json();
 await page.goto(`/projects/${p.id}/tasks`);await addTaskFilter(page,d.id,'empty');
 await expect(page.getByRole('button',{name:'Visible after clear',exact:true})).toBeVisible();
 await page.route(`**/projects/${p.id}/property-snapshot/tasks`,r=>r.fulfill({status:500,json:{error:{message:'Unavailable'}}}));
 await page.reload();await expect(page.getByRole('button',{name:'重试筛选',exact:true})).toBeVisible({timeout:15000});
 await expect(page.getByRole('button',{name:'Visible after clear',exact:true})).toHaveCount(0);
 await page.unroute(`**/projects/${p.id}/property-snapshot/tasks`);await page.getByRole('button',{name:'重试筛选',exact:true}).click();
 await expect(page.getByRole('button',{name:'Visible after clear',exact:true})).toBeVisible();
 await request.delete(`/api/v1/property-definitions/${d.id}`,{data:{version:d.version}});
 await page.reload();await expect(page.getByRole('alert')).toContainText('失效');
 await page.getByRole('button',{name:'清除全部',exact:true}).click();await expect(page.getByRole('button',{name:'Visible after clear',exact:true})).toBeVisible();
});

test('today filters roll over at midnight in the application timezone',async({page,request})=>{
 await page.clock.install({time:new Date('2026-10-27T15:59:58Z')});
 const p=await(await request.post('/api/v1/projects',{data:{title:'Midnight filter'}})).json();
 for(const [title,due_date] of [['Before midnight','2026-10-27'],['After midnight','2026-10-28']])await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title,due_date}});
 await page.goto(`/projects/${p.id}/tasks`);await addTaskFilter(page,'due_date','today');
 await expect(page.getByRole('button',{name:'Before midnight',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'After midnight',exact:true})).toHaveCount(0);
 await page.clock.fastForward(4000);
 await expect(page.getByRole('button',{name:'After midnight',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Before midnight',exact:true})).toHaveCount(0);
});

test('deleted multiselect choices can be removed and replaced inside the condition editor',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Deleted filter choice'}})).json();
 await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'Task'}});
 let d=await(await request.post(`/api/v1/projects/${p.id}/property-definitions/tasks`,{data:{kind:'multi_select'}})).json();
 d=await(await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:d.version,options:[{id:'a',name:'A'},{id:'b',name:'B'}]}})).json();
 await page.goto(`/projects/${p.id}/tasks`);await page.getByRole('button',{name:'筛选任务'}).click();
 let dialog=page.getByRole('dialog',{name:'添加筛选条件'});await dialog.getByLabel('筛选属性').selectOption(d.id);await dialog.getByRole('checkbox',{name:'A',exact:true}).check();await dialog.getByRole('button',{name:'应用筛选'}).click();
 await request.delete(`/api/v1/property-definitions/${d.id}/options/a`,{data:{version:d.version}});
 await page.reload();await expect(page.getByRole('alert')).toContainText('失效');
 await page.getByRole('button',{name:/编辑筛选/}).click();dialog=page.getByRole('dialog',{name:'编辑筛选条件'});
 await dialog.getByRole('checkbox',{name:/已删除选项/}).click();await dialog.getByRole('checkbox',{name:'B',exact:true}).check();await dialog.getByRole('button',{name:'应用筛选'}).click();
 await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('button',{name:/编辑筛选.*B/})).toBeVisible();
});

test('blocked preference storage still permits filtering in the current session',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Session filter'}})).json();
 await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'Keep me'}});
 await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('blocked')};Storage.prototype.setItem=()=>{throw new Error('blocked')};});
 await page.goto(`/projects/${p.id}/tasks`);await addTaskFilter(page,'title','contains','Keep');
 await expect(page.getByRole('button',{name:'Keep me',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/编辑筛选 标题/})).toBeVisible();
});

test('a stage-filtered task disappears immediately after a successful drag to another stage',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Filtered drag'}})).json();
 const t=await(await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'Move out of filter'}})).json();
 await page.goto(`/projects/${p.id}/tasks`);await addTaskFilter(page,'stage','is','todo');
 await page.getByRole('button',{name:'拖动任务 Move out of filter',exact:true}).dragTo(page.getByRole('region',{name:'Done阶段',exact:true}));
 await expect(page.getByText('没有符合条件的任务',{exact:true})).toBeVisible();
 await expect.poll(async()=> (await(await request.get(`/api/v1/tasks/${t.id}`)).json()).stage).toBe('done');
 await page.getByRole('button',{name:'清除筛选',exact:true}).click();
 await expect(page.getByRole('region',{name:'Done阶段',exact:true}).getByRole('button',{name:'Move out of filter',exact:true})).toBeVisible();
});
