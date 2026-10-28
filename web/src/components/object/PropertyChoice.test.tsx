import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PropertyChoice} from './PropertyChoice';
import type {PropertyDefinition} from './propertyTypes';
afterEach(cleanup);
it('shows an empty choice when selected IDs were removed from the definition',()=>{
 const definition={id:'d',project_id:'p',object_type:'tasks',name:'标签',kind:'multi_select',version:3,options:[{id:'b',name:'乙'}]} as PropertyDefinition;
 render(<PropertyChoice definition={definition} value={['a']} disabled={false} pending={false} onChange={vi.fn()} onDefinition={vi.fn()} onOptionDeleted={async()=>{}}/>);
 expect(screen.getByRole('button',{name:'属性值 标签'})).toHaveTextContent('未选择');
});
