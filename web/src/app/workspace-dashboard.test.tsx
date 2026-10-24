import {render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import {createMemoryRouter,RouterProvider} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Workspace} from '../features/workspace/Workspace';

it('prioritizes overdue work without timezone or project creation controls',()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 const item={id:'t',type:'tasks',title:'修复阻塞',project_id:'p',project_title:'Noteapp',due_date:'2026-10-23',archived:false};
 client.setQueryData(['today'],{date:'2026-10-24',timezone:'Asia/Shanghai',overdue:[item],today:[],events:[]});
 client.setQueryData(['recent'],[]);
 const router=createMemoryRouter([{path:'/',element:<Workspace/>}]);
 render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);
 expect(screen.queryByText(/Asia\/Shanghai/)).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/创建.*项目/})).not.toBeInTheDocument();
 expect(screen.getByRole('region',{name:'优先处理'})).toContainElement(screen.getByRole('link',{name:/修复阻塞/}));
 expect(screen.getByText('1 项需要关注')).toBeVisible();
});
