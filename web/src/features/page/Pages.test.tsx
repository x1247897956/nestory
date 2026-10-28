import {render, screen, fireEvent, waitFor, cleanup} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Pages} from './Pages';
vi.mock('../../app/api',()=>({api:vi.fn(async()=>[
 {id:'a',title:'Alpha',position:2,created_at:1,updated_at:4},
 {id:'z',title:'Zeta',position:1,created_at:2,updated_at:3},
]),abandonCreateIntent:vi.fn()}));
function mount(projectId:string){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><Pages projectId={projectId} archived={false}/></MemoryRouter></QueryClientProvider>);}
beforeEach(()=>{localStorage.clear();HTMLElement.prototype.showPopover=function(){this.style.display='block';};HTMLElement.prototype.hidePopover=function(){this.style.display='none';};});
afterEach(cleanup);
it('sorts notes and restores a separate choice for each project',async()=>{
 let view=mount('one');
 await waitFor(()=>expect(screen.getAllByRole('link').map(link=>link.textContent)).toEqual(['Zeta','Alpha']));
 fireEvent.click(screen.getByRole('button',{name:'笔记排序器'}));
 fireEvent.change(screen.getByLabelText('笔记排序字段'),{target:{value:'title'}});
 fireEvent.click(screen.getByRole('button',{name:'应用排序'}));
 expect(screen.getAllByRole('link').map(link=>link.textContent)).toEqual(['Alpha','Zeta']);
 fireEvent.click(screen.getByRole('button',{name:'笔记排序器'}));
 fireEvent.change(screen.getByLabelText('笔记排序方向'),{target:{value:'desc'}});
 fireEvent.click(screen.getByRole('button',{name:'应用排序'}));
 view.unmount();view=mount('two');
 fireEvent.click(screen.getByRole('button',{name:'笔记排序器'}));expect(screen.getByLabelText('笔记排序字段')).toHaveValue('position');
 view.unmount();mount('one');
 fireEvent.click(screen.getByRole('button',{name:'笔记排序器'}));expect(screen.getByLabelText('笔记排序字段')).toHaveValue('title');
 expect(screen.getByLabelText('笔记排序方向')).toHaveValue('desc');
});
