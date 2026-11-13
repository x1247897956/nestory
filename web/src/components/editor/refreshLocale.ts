import type {EditorView,NodeViewConstructor} from 'prosemirror-view';
const originalViews=new WeakMap<EditorView,Record<string,NodeViewConstructor>>();
// Public ProseMirror presentation API: redraw node views with the same state,
// preserving document, selection, undo and uploads. Defer during IME composition.
export function refreshLocale(view:EditorView) {
 let timer:ReturnType<typeof setTimeout>|undefined;
 let stopped=false;
 const redraw=()=>{
  if(stopped||view.isDestroyed)return;
  if(view.composing){timer=setTimeout(redraw,50);return;}
  let constructors=originalViews.get(view);
  if(!constructors){
   constructors={};
   view.someProp('nodeViews',items=>{for(const [name,create] of Object.entries(items))if(!constructors![name])constructors![name]=create;return false;});
   originalViews.set(view,constructors);
  }
  view.setProps({nodeViews:Object.fromEntries(Object.entries(constructors).map(([name,create])=>[name,(...args:Parameters<NodeViewConstructor>)=>create(...args)]))});
 };
 redraw();
 return ()=>{stopped=true;if(timer)clearTimeout(timer);};
}
