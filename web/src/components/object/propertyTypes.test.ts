import { expect, it } from 'vitest';
import {validPropertyURL,normalizePropertyValue} from './propertyTypes';
it('only offers HTTP/S links, never executable schemes or embedded credentials',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,<script>','file:///etc/passwd','https://user:password@example.com','/relative','https://']) expect(validPropertyURL(value)).toBe(false);
 for(const value of [null,'','https://example.com/path?q=1','http://localhost:8080']) expect(validPropertyURL(value)).toBe(true);
});

it('normalizes empty choices and URL whitespace before save/retry comparison',()=>{
 expect(normalizePropertyValue('multi_select',[])).toBeNull();
 expect(normalizePropertyValue('url','  https://example.com/  ')).toBe('https://example.com/');
 expect(normalizePropertyValue('text','  text  ')).toBe('  text  ');
});
