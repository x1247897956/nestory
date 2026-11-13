import {test,expect} from '@playwright/test';
import {block,documentOf} from './block-fixtures';

test('language persists, updates another tab and preserves native editor content and undo',async({page,context,request})=>{
 const project=await(await request.post('/api/v1/projects',{data:{title:'保留中文项目 '+Date.now()}})).json();
 const note=await(await request.post(`/api/v1/projects/${project.id}/pages`,{data:{title:'保留中文笔记',body_document:documentOf(block('paragraph','原有中文正文'))}})).json();
 await page.goto(`/projects/${project.id}/pages/${note.id}`);
 const body=page.getByRole('textbox',{name:'Markdown 正文',exact:true});
 await expect(body).toBeVisible();
 await expect(body).toHaveAttribute('contenteditable','true');
 await body.click();await body.pressSequentially(' draft');
 await expect(page.locator('.autosave-indicator [role="status"]')).toHaveText('已保存');
 const editedText=await body.textContent();
 expect(editedText).toContain('原有中文正文');expect(editedText).toContain('draft');
 const editorHandle=await body.elementHandle();
 const settings=await context.newPage();await settings.goto('/settings');
 await settings.getByLabel('语言',{exact:true}).selectOption('en');
 await expect(settings.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 const englishBody=page.getByRole('textbox',{name:'Rich text content',exact:true});
 await expect(englishBody).toHaveText(editedText!);
 expect(await englishBody.evaluate((node,oldNode)=>node===oldNode,editorHandle)).toBe(true);
 await englishBody.click();await englishBody.press('ControlOrMeta+z');
 await expect(englishBody).toContainText('原有中文正文');
 await expect(englishBody).not.toContainText('draft');
 await expect(page.locator('.autosave-indicator [role="status"]')).toHaveText('Saved');
 await settings.reload();await expect(settings.getByLabel('Language',{exact:true})).toHaveValue('en');
 const stored=await(await request.get(`/api/v1/pages/${note.id}`)).json();
 expect(stored.title).toBe('保留中文笔记');
 expect(stored.body_document.blocks[0].content[0].text).toBe('原有中文正文');
 await settings.getByLabel('Language',{exact:true}).selectOption('zh-CN');
 await expect(page.getByRole('textbox',{name:'Markdown 正文',exact:true})).toBeVisible();
 await settings.close();
});

test('English calendar and trash use English system labels',async({page,request})=>{
 await page.goto('/settings');await page.getByLabel('语言',{exact:true}).selectOption('en');
 const project=await(await request.post('/api/v1/projects',{data:{title:'English interface'}})).json();
 await page.goto(`/projects/${project.id}/events`);
 await expect(page.getByRole('button',{name:'Today',exact:true})).toBeVisible();
 await expect(page.locator('.fc-col-header-cell').first()).toContainText('Mon');
 await expect(page.getByRole('button',{name:'New event',exact:true})).toBeVisible();
 await page.goto('/trash');await expect(page.getByRole('heading',{name:'Trash',exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');
});

test('already mounted empty media prompts and placeholders follow language without document edits',async({page,context,request})=>{
 const project=await(await request.post('/api/v1/projects',{data:{title:'Editor language prompts'}})).json();
 const original={version:1,blocks:[{id:'empty-image',type:'image',props:{url:'',caption:'',name:'',showPreview:true},children:[]},block('paragraph','')]};
 const note=await(await request.post(`/api/v1/projects/${project.id}/pages`,{data:{title:'图片提示',body_document:original}})).json();
 await page.goto(`/projects/${project.id}/pages/${note.id}`);
 await expect(page.locator('.bn-add-file-button-text')).toHaveText('添加图片');
 const settings=await context.newPage();await settings.goto('/settings');
 await settings.getByLabel('语言',{exact:true}).selectOption('en');
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.locator('.bn-add-file-button-text')).toHaveText('Add image');
 const paragraph=page.locator('.bn-block-content[data-content-type="paragraph"]').last();
 await paragraph.click();
 await expect.poll(()=>paragraph.evaluate(node=>getComputedStyle(node,'::after').content)).toContain('Type text, or press / to insert content');
 const stored=await(await request.get(`/api/v1/pages/${note.id}`)).json();
 expect(stored.version).toBe(1);expect(stored.body_document).toEqual(original);
 await page.bringToFront();await paragraph.click();
 await page.getByRole('textbox',{name:'Rich text content',exact:true}).pressSequentially('/heading');
 await expect(page.getByRole('option',{name:/Heading 1/}).first()).toBeVisible();
 await page.getByRole('textbox',{name:'Rich text content',exact:true}).press('Escape');
 await settings.getByLabel('Language',{exact:true}).selectOption('zh-CN');
 await expect(page.locator('.bn-add-file-button-text')).toHaveText('添加图片');
 await settings.close();
});

test('formatting toolbar block types refresh on the same editor after language changes',async({page,context,request})=>{
 const project=await(await request.post('/api/v1/projects',{data:{title:'Toolbar locale '+Date.now()}})).json();
 const note=await(await request.post(`/api/v1/projects/${project.id}/pages`,{data:{title:'Toolbar content',body_document:documentOf(block('paragraph','Keep this text'))}})).json();
 await page.goto(`/projects/${project.id}/pages/${note.id}`);
 const body=page.getByRole('textbox',{name:'Markdown 正文',exact:true});
 await body.getByText('Keep this text',{exact:true}).dblclick();
 await expect(page.locator('.bn-formatting-toolbar')).toContainText('段落');
 const settings=await context.newPage();await settings.goto('/settings');
 await settings.getByLabel('语言',{exact:true}).selectOption('en');
 await page.bringToFront();
 const englishBody=page.getByRole('textbox',{name:'Rich text content',exact:true});
 await englishBody.getByText('Keep this text',{exact:true}).dblclick();
 await expect(page.locator('.bn-formatting-toolbar')).toContainText('Paragraph');
 await expect(englishBody).toHaveText('Keep this text');
 await settings.close();
});

test('a lost note creation response keeps its original intent after language change and reload',async({page,context,request})=>{
 const project=await(await request.post('/api/v1/projects',{data:{title:'Creation locale '+Date.now()}})).json();
 const ids:string[]=[];let lost=true;
 await page.route(`**/api/v1/projects/${project.id}/pages`,async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  ids.push(route.request().postDataJSON().request_id);
  if(lost){lost=false;await route.fetch();await route.abort('failed');}else await route.continue();
 });
 await page.goto(`/projects/${project.id}/pages`);
 await page.getByRole('button',{name:'新建笔记',exact:true}).click();
 await expect(page.getByRole('button',{name:'重试新建',exact:true})).toBeVisible();
 const settings=await context.newPage();await settings.goto('/settings');
 await settings.getByLabel('语言',{exact:true}).selectOption('en');
 await page.reload();await page.getByRole('button',{name:'New note',exact:true}).click();
 await expect(page.getByLabel('Note title',{exact:true})).toHaveValue('无标题笔记');
 expect(ids[1]).toBe(ids[0]);expect(ids[0]).toBeTruthy();
 expect(await(await request.get(`/api/v1/projects/${project.id}/pages`)).json()).toHaveLength(1);
 await page.getByRole('link',{name:'Notes',exact:true}).click();
 await page.getByRole('button',{name:'New note',exact:true}).click();
 await expect(page.getByLabel('Note title',{exact:true})).toHaveValue('Untitled note');
 expect(ids[2]).not.toBe(ids[0]);
 expect(await(await request.get(`/api/v1/projects/${project.id}/pages`)).json()).toHaveLength(2);
 await settings.close();
});

test('a lost property creation response reuses its original English name after switching to Chinese',async({page,context,request})=>{
 await page.goto('/settings');await page.getByLabel('语言',{exact:true}).selectOption('en');
 const project=await(await request.post('/api/v1/projects',{data:{title:'Property locale '+Date.now()}})).json();
 const note=await(await request.post(`/api/v1/projects/${project.id}/pages`,{data:{title:'Property recovery'}})).json();
 const path=`/api/v1/projects/${project.id}/property-definitions/pages`;
 const ids:string[]=[];let lost=true;
 await page.route('**'+path,async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  ids.push(route.request().postDataJSON().request_id);
  if(lost){lost=false;await route.fetch();await route.abort('failed');}else await route.continue();
 });
 await page.goto(`/projects/${project.id}/pages/${note.id}`);
 await page.getByRole('button',{name:'Show properties',exact:true}).click();
 await page.getByRole('button',{name:'Add property',exact:true}).click();
 await page.locator('.property-type-picker').getByRole('button',{name:'Text',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry adding property',exact:true})).toBeVisible();
 const settings=await context.newPage();await settings.goto('/settings');
 await settings.getByLabel('Language',{exact:true}).selectOption('zh-CN');
 await page.reload();
 await page.getByRole('button',{name:'展开属性',exact:true}).click();
 await page.getByRole('button',{name:'添加属性',exact:true}).click();
 const retried=page.waitForResponse(response=>response.url().endsWith(path)&&response.request().method()==='POST'&&response.ok());
 await page.locator('.property-type-picker').getByRole('button',{name:'文本',exact:true}).click();
 await retried;
 await expect.poll(()=>ids.length).toBe(2);expect(ids[1]).toBe(ids[0]);
 const definitions=await(await request.get(path)).json();
 expect(definitions.definitions).toHaveLength(1);expect(definitions.definitions[0].name).toBe('Text');
 await settings.close();
});

test('a confirmed concurrent property-name conflict refreshes defaults before another explicit create',async({page,request})=>{
 await page.goto('/settings');await page.getByLabel('语言',{exact:true}).selectOption('en');
 const project=await(await request.post('/api/v1/projects',{data:{title:'Concurrent defaults '+Date.now()}})).json();
 const note=await(await request.post(`/api/v1/projects/${project.id}/pages`,{data:{title:'Stale property list'}})).json();
 const path=`/api/v1/projects/${project.id}/property-definitions/pages`;
 await page.goto(`/projects/${project.id}/pages/${note.id}`);
 await page.getByRole('button',{name:'Show properties',exact:true}).click();
 await expect(page.getByRole('button',{name:'Add property',exact:true})).toBeEnabled();
 expect((await request.post(path,{data:{kind:'text',name:'Text'}})).status()).toBe(201);
 await page.getByRole('button',{name:'Add property',exact:true}).click();
 const conflict=page.waitForResponse(response=>response.url().endsWith(path)&&response.request().method()==='POST'&&response.status()===409);
 await page.locator('.property-type-picker').getByRole('button',{name:'Text',exact:true}).click();await conflict;
 await expect(page.getByRole('button',{name:'Retry adding property',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add property',exact:true})).toBeEnabled();
 const created=page.waitForResponse(response=>response.url().endsWith(path)&&response.request().method()==='POST'&&response.ok());
 await page.locator('.property-type-picker').getByRole('button',{name:'Text',exact:true}).click();
 const response=await created;expect(response.request().postDataJSON().name).toBe('Text 2');
 const definitions=await(await request.get(path)).json();
 expect(definitions.definitions.map((item:{name:string})=>item.name).sort()).toEqual(['Text','Text 2']);
});
