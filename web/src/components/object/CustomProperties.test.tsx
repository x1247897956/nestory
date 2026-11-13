import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CustomProperties} from './CustomProperties';
import {ApiError} from '../../app/api';
import {setLanguage} from '../../i18n/language';
import type {PropertyDefinition} from './propertyTypes';
const {mockApi,mockRecover}=vi.hoisted(()=>({mockApi:vi.fn(),mockRecover:vi.fn()}));
vi.mock('../../app/api',async importOriginal=>({...await importOriginal<typeof import('../../app/api')>(),api:mockApi,recoverCreateInput:mockRecover}));
vi.mock('./PropertyField',()=>({PropertyField:()=>null}));
const path='/projects/p/property-definitions/tasks';
const fieldDefinition:PropertyDefinition={id:'d',project_id:'p',object_type:'tasks',kind:'text',name:'Text',version:1,options:[]};
function mount(catalog:PropertyDefinition[]=[],definitions:PropertyDefinition[]=[fieldDefinition]){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 client.setQueryData(['custom-properties','p','tasks','t'],{fields:definitions.map(definition=>({definition,value:null,version:1})),read_only:false});
 client.setQueryData(['property-catalog','p'],catalog);
 render(<QueryClientProvider client={client}><CustomProperties projectId="p" type="tasks" id="t" archived={false}/></QueryClientProvider>);
}
beforeEach(()=>{
 mockApi.mockReset().mockRejectedValue(new Error('Response lost'));
 mockRecover.mockReset();
 setLanguage('en');
});
afterEach(()=>{cleanup();setLanguage('zh-CN');});
it('reuses the pending payload after a lost response instead of generating a second property',async()=>{
 mockRecover.mockImplementation((_path,matches)=>matches({kind:'text',name:'Text'})?{kind:'text',name:'Text'}:undefined);
 mount();
 fireEvent.click(screen.getByRole('button',{name:'Text',hidden:true}));
 await waitFor(()=>expect(mockApi).toHaveBeenCalledWith(path,'POST',{kind:'text',name:'Text'}));
 fireEvent.click(await screen.findByRole('button',{name:'Retry adding property'}));
 await waitFor(()=>expect(mockApi).toHaveBeenCalledTimes(2));
 expect(mockApi).toHaveBeenLastCalledWith(path,'POST',{kind:'text',name:'Text'});
});
it('preserves an English pending default when retrying from the Chinese interface',async()=>{
 setLanguage('zh-CN');
 mockRecover.mockImplementation((_path,matches)=>matches({kind:'text',name:'Text'})?{kind:'text',name:'Text'}:undefined);
 mount();
 fireEvent.click(screen.getByRole('button',{name:'文本',hidden:true}));
 await waitFor(()=>expect(mockApi).toHaveBeenCalledWith(path,'POST',{kind:'text',name:'Text'}));
});
it('keeps an unnamed Chinese creation intent unchanged after switching to English',async()=>{
 mockRecover.mockImplementation((_path,matches)=>matches({kind:'text'})?{kind:'text'}:undefined);
 mount();
 fireEvent.click(screen.getByRole('button',{name:'Text',hidden:true}));
 await waitFor(()=>expect(mockApi).toHaveBeenCalledWith(path,'POST',{kind:'text'}));
});
it('generates the next English default when there is no valid pending creation',async()=>{
 mockRecover.mockImplementation((_path,matches)=>{
  expect(matches({kind:'single_select',name:'Text'})).toBe(false);
  expect(matches({kind:'text',name:'Text',source_id:'other'})).toBe(false);
  expect(matches({kind:'text',name:42})).toBe(false);
  return undefined;
 });
 mount();
 fireEvent.click(screen.getByRole('button',{name:'Text',hidden:true}));
 await waitFor(()=>expect(mockApi).toHaveBeenCalledWith(path,'POST',{kind:'text',name:'Text 2'}));
});
it('keeps source-property reuse payloads independent of pending new-property defaults',async()=>{
 mount([{...fieldDefinition,id:'source',object_type:'pages',name:'文本',version:7}]);
 fireEvent.click(screen.getByRole('button',{name:'Reuse 文本 (Notes)',hidden:true}));
 await waitFor(()=>expect(mockApi).toHaveBeenCalledWith(path,'POST',{source_id:'source',source_version:7}));
 expect(mockRecover).not.toHaveBeenCalled();
});
it('releases the creating state when durable recovery storage cannot be read',async()=>{
 mockRecover.mockImplementation(()=>{throw new Error('Storage unavailable');});
 mount();
 fireEvent.click(screen.getByRole('button',{name:'Text',hidden:true}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable');
 expect(screen.getByRole('button',{name:'Add property'})).toBeEnabled();
 expect(mockApi).not.toHaveBeenCalled();
});

it('refreshes names after a definitive name conflict before allowing another creation',async()=>{
 let finishRefresh!:(value:unknown)=>void;
 mockApi.mockImplementation((_path,method)=>{
  if(method==='POST')return Promise.reject(new ApiError(409,'同类型已有此名称的属性'));
  return new Promise(resolve=>{finishRefresh=resolve;});
 });
 mount([],[]);
 fireEvent.click(screen.getByRole('button',{name:'Text',hidden:true}));
 await waitFor(()=>expect(mockApi).toHaveBeenCalledWith(path,'POST',{kind:'text',name:'Text'}));
 await waitFor(()=>expect(mockApi).toHaveBeenCalledWith('/objects/tasks/t/custom-properties'));
 expect(screen.getByRole('button',{name:'Add property'})).toBeDisabled();
 expect(screen.queryByRole('button',{name:'Retry adding property'})).not.toBeInTheDocument();
 expect(mockApi.mock.calls.filter(call=>call[1]==='POST')).toHaveLength(1);
 await act(async()=>finishRefresh({fields:[{definition:fieldDefinition,value:null,version:1}],read_only:false}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Add property'})).toBeEnabled());
 expect(screen.queryByRole('button',{name:'Retry adding property'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Text',hidden:true}));
 await waitFor(()=>expect(mockApi).toHaveBeenCalledWith(path,'POST',{kind:'text',name:'Text 2'}));
 // Complete the second conflict refresh so cleanup has no pending operation.
 await act(async()=>finishRefresh({fields:[{definition:fieldDefinition,value:null,version:1}],read_only:false}));
});
it('preserves the retry payload for other conflicts instead of refreshing or changing names',async()=>{
 mockApi.mockRejectedValue(new ApiError(409,'内容已更新，请重新加载'));
 mount();
 fireEvent.click(screen.getByRole('button',{name:'Text',hidden:true}));
 fireEvent.click(await screen.findByRole('button',{name:'Retry adding property'}));
 await waitFor(()=>expect(mockApi).toHaveBeenCalledTimes(2));
 expect(mockApi.mock.calls).toEqual([[path,'POST',{kind:'text',name:'Text 2'}],[path,'POST',{kind:'text',name:'Text 2'}]]);
});
