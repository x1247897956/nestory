import {afterEach,expect,it,vi} from 'vitest';
import {getTabOwner,initializeTabIdentity} from './tabIdentity';
afterEach(()=>vi.unstubAllGlobals());
it('keeps reload identity but separates a blank-name window with copied session storage',()=>{
 const first=getTabOwner();expect(getTabOwner()).toBe(first);
 window.name=''; // window.open has its own browsing context name.
 expect(getTabOwner()).not.toBe(first);
});
it('probes a live context even when sessionStorage and window.name were both cloned',async()=>{
 const original=getTabOwner();const claims:string[]=[];
 class FakeChannel {
  onmessage:((event:{data:any})=>void)|null=null;
  postMessage(data:any){
   if(data.kind!=='claim')return;
   claims.push(data.owner);
   if(data.owner===original)queueMicrotask(()=>this.onmessage?.({data:{kind:'occupied',owner:original,target:data.instance}}));
  }
  close(){}
 }
 vi.stubGlobal('BroadcastChannel',FakeChannel);
 await initializeTabIdentity();
 expect(claims[0]).toBe(original);expect(getTabOwner()).not.toBe(original);
 expect(claims.at(-1)).toBe(getTabOwner());
});

it('keeps the ownership responder across a persisted pagehide',async()=>{
 const close=vi.fn();
 class FakeChannel { onmessage:any; postMessage(){} close=close; }
 vi.stubGlobal('BroadcastChannel',FakeChannel);
 await initializeTabIdentity();
 window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
 expect(close).not.toHaveBeenCalled();
 window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));
 expect(close).toHaveBeenCalled();
});
