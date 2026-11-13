import {afterEach,expect,it} from 'vitest';
import {englishMessages,t} from './index';
import {setLanguage} from './language';
afterEach(()=>setLanguage('zh-CN'));
const parameters=(value:string)=>[...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
it('keeps every catalog interpolation parameter and English system text valid',()=>{
 for(const [source,translation] of Object.entries(englishMessages)){
  const variants=typeof translation==='string'?[translation]:Object.values(translation);
  for(const value of variants){
   expect(parameters(value),source).toEqual(parameters(source));
   if(source!=='简体中文')expect(value,source).not.toMatch(/[\u3400-\u9fff]/);
  }
 }
});
it('interpolates user names literally without translating or expanding their content',()=>{
 setLanguage('en');
 expect(t('选择 {title}',{title:'设置 $& {count}'})).toBe('Choose 设置 $& {count}');
 expect(t('任务')).toBe('Tasks');expect(t('项目')).toBe('Projects');
});
