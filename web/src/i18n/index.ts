import {coreMessages} from './core';
import {workspaceMessages} from './workspace';
import {objectMessages} from './object';
import {contentMessages} from './content';
import {serverMessages} from './server';
import {settingsMessages} from './settings';
import {getLanguage,useLanguage} from './language';
import type {Values} from './types';
export type {Language,Messages,Translation,Values} from './types';
export {getLanguage} from './language';
export const englishMessages = {...workspaceMessages,...objectMessages,...contentMessages,...serverMessages,...settingsMessages,...coreMessages};
const escape = (value:string) => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns = Object.keys(englishMessages).filter(key => /\{\w+\}/.test(key)).map(key => {
  const names:string[]=[];
  const parts=key.split(/(\{\w+\})/).map(part => {
    if (/^\{\w+\}$/.test(part)) {names.push(part.slice(1,-1));return '(.+?)';}
    return escape(part);
  });
  return {key,names,expression:new RegExp('^'+parts.join('')+'$')};
});
function interpolate(message:string,values:Values) {
  return message.replace(/\{(\w+)\}/g,(token,key) => values[key] === undefined ? token : String(values[key]));
}
export function t(source:string,values:Values = {}):string {
  if (getLanguage() === 'zh-CN') return interpolate(source,values);
  let key=source;
  if (!englishMessages[key]) {
    const pattern=patterns.find(pattern => pattern.expression.test(source));
    if (pattern) {
      key=pattern.key;const match=pattern.expression.exec(source)!;
      values={...Object.fromEntries(pattern.names.map((name,index) => [name,match[index+1]])),...values};
    }
  }
  const translated=englishMessages[key];
  if (!translated) return interpolate(source,values);
  const message=typeof translated === 'string' ? translated : (Number(values.count) === 1 ? translated.one : translated.other);
  return interpolate(message,values);
}
// Translate only known system prefixes. The trailing text remains an error
// boundary, so nested validation details are translated without touching IDs.
const errorPrefixes = [
  '阶段更新失败，请重试：','父任务调整失败：','上传失败：',
  '正文同步失败，草稿已保留：','导入失败：','选项已删除，同步属性失败：',
];
export function translateError(message:string,code?:string):string {
  if (getLanguage() === 'zh-CN') return message;
  const prefix=errorPrefixes.find(prefix=>message.startsWith(prefix));
  if (prefix) return t(prefix)+translateError(message.slice(prefix.length),code);
  // Error placeholders contain nested system messages. Other placeholders may
  // contain user titles or identifiers and must remain verbatim.
  const pattern=patterns.find(pattern=>pattern.names.some(name=>name==='message'||name==='error')&&pattern.expression.test(message));
  if (pattern) {
    const match=pattern.expression.exec(message)!;
    const values=Object.fromEntries(pattern.names.map((name,index)=>[
      name,name==='message'||name==='error'?translateError(match[index+1],code):match[index+1],
    ]));
    return t(pattern.key,values);
  }
  const translated=t(message);
  if (getLanguage() === 'en' && translated === message && /[\u3400-\u9fff]/.test(message)) {
    return code === 'conflict' ? 'This item changed. Refresh and try again.' : 'The operation could not be completed. Please check your input and try again.';
  }
  return translated;
}
export function useI18n() {const language=useLanguage();return {t,language};}
