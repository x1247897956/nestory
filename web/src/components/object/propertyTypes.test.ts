import { afterEach, expect, it } from 'vitest';
import {validPropertyURL,normalizePropertyValue,newPropertyInput} from './propertyTypes';
it('only offers HTTP/S links, never executable schemes or embedded credentials',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,<script>','file:///etc/passwd','https://user:password@example.com','/relative','https://']) expect(validPropertyURL(value)).toBe(false);
 for(const value of [null,'','https://example.com/path?q=1','http://localhost:8080']) expect(validPropertyURL(value)).toBe(true);
});

it('normalizes empty choices and URL whitespace before save/retry comparison',()=>{
 expect(normalizePropertyValue('multi_select',[])).toBeNull();
 expect(normalizePropertyValue('url','  https://example.com/  ')).toBe('https://example.com/');
 expect(normalizePropertyValue('text','  text  ')).toBe('  text  ');
});

import {setLanguage} from '../../i18n/language';
afterEach(()=>setLanguage('zh-CN'));
it('creates English system defaults with stable kind IDs and avoids existing user names',()=>{
 setLanguage('en');
 const existing=['text','Text 2','文本'];
 expect(newPropertyInput('text',existing)).toEqual({kind:'text',name:'Text 3'});
 expect(existing).toEqual(['text','Text 2','文本']);
 expect(newPropertyInput('single_select',[])).toEqual({kind:'single_select',name:'Single select'});
 setLanguage('zh-CN');
 expect(newPropertyInput('text',existing)).toEqual({kind:'text'});
});
