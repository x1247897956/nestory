import {getLanguage,t} from "../../i18n";
export type PropertyKind = "text" | "single_select" | "multi_select" | "url";
export type PropertyOption = {id:string;name:string;color?:string};
export type PropertyDefinition = {id:string;project_id:string;object_type:"tasks"|"pages"|"events";name:string;kind:PropertyKind;options:PropertyOption[];version:number};
export type PropertyValue = string | string[] | null;
export type CustomField = {definition:PropertyDefinition;value:PropertyValue;version:number};
export type PropertyView = {fields:CustomField[];read_only:boolean};
export const propertyKinds: {kind:PropertyKind;name:string;icon:string}[] = [
 {kind:"text",name:"文本",icon:"M4 5h12M10 5v12M7 17h6"},
 {kind:"single_select",name:"单选",icon:"M4 7h12M4 13h7m2-1 2 2 3-4"},
 {kind:"multi_select",name:"多选",icon:"m2 6 2 2 3-4m2 3h9M2 14l2 2 3-4m2 3h9"},
 {kind:"url",name:"网址",icon:"m8 12 4-4m-5 6-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m0 6a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-1 1"},
];
export function validPropertyURL(value:PropertyValue):boolean {
 if(value===null||value==="")return true;
 if(typeof value!=="string"||value.length>2048)return false;
 try { const url=new URL(value);return ["http:","https:"].includes(url.protocol)&&!!url.hostname&&!url.username&&!url.password; }catch{return false;}
}
export function positionPropertyPopover(panel:HTMLElement|null,trigger:HTMLElement|null) {
 if(!panel||!trigger)return;
 const rect=trigger.getBoundingClientRect();const width=Math.min(320,window.innerWidth-24);
 panel.style.width=width+"px";
 panel.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+"px";
 const top=Math.max(12,Math.min(rect.bottom+6,window.innerHeight-220));
 panel.style.top=top+"px";
 panel.style.maxHeight=Math.max(120,window.innerHeight-top-12)+"px";
}

export function normalizePropertyValue(kind:PropertyKind,value:PropertyValue):PropertyValue {
 if(Array.isArray(value))return value.length?value:null;
 if(kind==="url"&&typeof value==="string")return value.trim()||null;
 return value===""?null:value;
}

export const propertyColors = [
 {id:"gray",name:"灰色"},{id:"brown",name:"棕色"},{id:"orange",name:"橙色"},
 {id:"yellow",name:"黄色"},{id:"green",name:"绿色"},{id:"blue",name:"蓝色"},
 {id:"purple",name:"紫色"},{id:"pink",name:"粉色"},{id:"red",name:"红色"},
];
export const optionColor=(color?:string)=>propertyColors.some(c=>c.id===color)?color:"gray";

// Only newly generated names follow the UI language. Existing definitions and
// names copied from another object type remain user data.
export function newPropertyInput(kind:PropertyKind,existingNames:string[]):{kind:PropertyKind;name?:string} {
 if(getLanguage()!=="en")return {kind};
 const base=t(propertyKinds.find(item=>item.kind===kind)!.name);
 const names=new Set(existingNames.map(name=>name.toLocaleLowerCase()));
 let name=base;
 for(let suffix=2;names.has(name.toLocaleLowerCase());suffix++)name=`${base} ${suffix}`;
 return {kind,name};
}
