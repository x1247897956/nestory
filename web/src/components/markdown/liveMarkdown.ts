import {syntaxTree} from '@codemirror/language';
import {Decoration,EditorView,ViewPlugin,WidgetType,type DecorationSet} from '@codemirror/view';

class Check extends WidgetType {
 constructor(readonly checked:boolean,readonly at:number,readonly disabled:boolean){super()}
 eq(other:Check){return this.checked===other.checked&&this.at===other.at&&this.disabled===other.disabled}
 toDOM(view:EditorView){const input=document.createElement('input');input.type='checkbox';input.checked=this.checked;input.disabled=this.disabled;input.className='live-task-check';input.setAttribute('aria-label','切换检查项');input.addEventListener('change',()=>view.dispatch({changes:{from:this.at,to:this.at+1,insert:input.checked?'x':' '}}));return input}
 ignoreEvent(){return true}
}
class Picture extends WidgetType {
 constructor(readonly url:string,readonly alt:string){super()}
 eq(other:Picture){return this.url===other.url&&this.alt===other.alt}
 toDOM(){const image=document.createElement('img');image.src=this.url;image.alt=this.alt;image.className='live-markdown-image';return image}
}
function decorate(view:EditorView){
 const ranges:{from:number;to:number;value:Decoration}[]=[];
 const active=view.hasFocus?view.state.doc.lineAt(view.state.selection.main.head).number:-1;
 const tree=syntaxTree(view.state);
 tree.iterate({enter(node){
  const name=node.name,from=node.from,to=node.to;
  const line=view.state.doc.lineAt(from),editing=line.number===active;
  const add=(value:Decoration,a=from,b=to)=>ranges.push({from:a,to:b,value});
  if(/^ATXHeading[1-6]$/.test(name))add(Decoration.line({class:'live-heading live-h'+name.slice(-1)}),line.from,line.from);
  if(name==='StrongEmphasis')add(Decoration.mark({class:'live-strong'}));
  if(name==='Emphasis')add(Decoration.mark({class:'live-emphasis'}));
  if(name==='InlineCode')add(Decoration.mark({class:'live-code'}));
  if(name==='Blockquote')add(Decoration.line({class:'live-quote'}),line.from,line.from);
  if(!editing&&['HeaderMark','EmphasisMark','CodeMark','QuoteMark','CodeInfo'].includes(name))add(Decoration.replace({}));
  if(name==='FencedCode'||name==='CodeBlock'){
   for(let at=line.from;at<=to;){const codeLine=view.state.doc.lineAt(at);add(Decoration.line({class:'live-code-block'}),codeLine.from,codeLine.from);if(codeLine.to>=to)break;at=codeLine.to+1}
  }
  if(!editing&&name==='Link'){
   const link=/^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(view.state.doc.sliceString(from,to));
   if(link&&/^(https?:\/\/|mailto:|\/(?!\/)|#)/.test(link[2])){
    add(Decoration.replace({}),from,from+1);add(Decoration.replace({}),from+1+link[1].length,to);
    add(Decoration.mark({tagName:'a',class:'live-link',attributes:{href:link[2],target:'_blank',rel:'noopener noreferrer'}}),from+1,from+1+link[1].length);return false;
   }
  }
  if(!editing&&name==='Image'){
   const match=/^!\[([^\]]*)\]\(([^\s)]+)\)$/.exec(view.state.doc.sliceString(from,to));
   if(match&&(/^(https?:\/\/|\/api\/v1\/assets\/)/.test(match[2]))) {add(Decoration.replace({widget:new Picture(match[2],match[1])}));return false}
  }
 }});
 for(let i=1;i<=view.state.doc.lines;i++){
  const line=view.state.doc.line(i);if(i===active)continue;
  let node=tree.resolveInner(line.from,1);let code=false;
  while(node){if(['FencedCode','CodeBlock'].includes(node.name)){code=true;break}if(!node.parent)break;node=node.parent}
  if(code)continue;
  const match=/^(\s*[-+*]\s+)\[([ xX])\]/.exec(line.text);
  if(match){const at=line.from+match[1].length;ranges.push({from:at,to:at+3,value:Decoration.replace({widget:new Check(match[2]!==' ',at+1,!view.state.facet(EditorView.editable))})})}
 }
 return Decoration.set(ranges.map(x=>x.value.range(x.from,x.to)),true);
}
export const liveMarkdown=ViewPlugin.fromClass(class{
 decorations:DecorationSet;
 constructor(view:EditorView){this.decorations=decorate(view)}
 update(update:{view:EditorView}){this.decorations=decorate(update.view)}
},{decorations:plugin=>plugin.decorations});
