import {expect,it} from 'vitest';
import {editorDictionary, placeholderRules} from './editorLocale';
it('provides isolated dictionaries and locale scoped placeholders',()=>{
 const zh=editorDictionary('zh-CN'),en=editorDictionary('en');
 expect(zh.placeholders.default).toBe('输入文字，或按 / 插入内容');
 expect(en.placeholders.default).toBe('Type text, or press / to insert content');
 en.placeholders.default='changed';
 expect(editorDictionary('en').placeholders.default).toBe('Type text, or press / to insert content');
 expect(placeholderRules('en')).toContain('[data-language="en"]');
 expect(placeholderRules('en')).toContain('Type text, or press / to insert content');
 expect(placeholderRules('en')).not.toContain('输入');
});
