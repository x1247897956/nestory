// Called by release_probe.py only, after it creates its disposable container.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(new URL('../../web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const [name,base,pid,note]=process.argv.slice(2);
if(!name?.startsWith('noteapp-audit-probe-'))throw Error('Disposable audit container required');
const info=JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0];
const port=info.NetworkSettings.Ports['8080/tcp'][0].HostPort;
if(base!==`http://127.0.0.1:${port}`)throw Error('Container port mismatch');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
try {
 const page=await browser.newPage();const results={};
 for(const [key,path,selector] of [
  ['task_list',`/projects/${pid}/tasks`,'.task-title'],
  ['note_list',`/projects/${pid}/pages`,'.page-list-row'],
  ['edit',`/projects/${pid}/pages/${note}`,'[role="textbox"][aria-label="Markdown 正文"]'],
 ]) {
  const start=performance.now();await page.goto(base+path);await page.locator(selector).first().waitFor();
  results[key]={ready_ms:Math.round(performance.now()-start),nodes:await page.locator('*').count(),heap_bytes:await page.evaluate(()=>performance.memory?.usedJSHeapSize)};
 }
 const start=performance.now();await page.getByRole('textbox',{name:'Markdown 正文'}).press('End');await page.getByRole('textbox',{name:'Markdown 正文'}).pressSequentially(' audit-edit');
 results.type_ms=Math.round(performance.now()-start);
 await page.getByRole('status').filter({hasText:'已保存'}).waitFor();results.autosaved_ms=Math.round(performance.now()-start);
 console.log(JSON.stringify(results));
}finally{await browser.close();}
