import {en,zh} from '@blocknote/core/locales';
import type {Language} from '../../i18n/types';
export function editorDictionary(language:Language) {
 const source=language==='en'?en:zh;
 const dictionary={...source,placeholders:{...source.placeholders}};
 dictionary.placeholders.default=language==='en'?'Type text, or press / to insert content':'输入文字，或按 / 插入内容';
 return dictionary;
}
// BlockNote initializes placeholder CSS once. Override only its presentation so
// changing language retains the editor instance, undo history and pending files.
export function placeholderRules(language:Language) {
 return Object.entries(editorDictionary(language).placeholders).map(([type,text])=>{
  const selector=type==='default'?'[data-is-empty-and-focused]':type==='emptyDocument'?'[data-is-only-empty-block]':`[data-content-type="${type}"]`;
  return `.block-editor[data-language="${language}"] .bn-editor .bn-block-content${selector}:has(.ProseMirror-trailingBreak:only-child):after {content:${JSON.stringify(text)};}`;
 }).join('\n');
}
