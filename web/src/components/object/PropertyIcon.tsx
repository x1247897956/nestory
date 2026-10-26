import {propertyKinds} from './propertyTypes';
const paths:Record<string,string>={
 stage:'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z M10 6v4l3 2',
 priority:'M5 17V3m0 1h10l-2 3 2 3H5',
 due_date:'M4 5h12v12H4ZM7 3v4m6-4v4M4 9h12',
 parent_id:'M5 4h10v5H5Zm5 5v4m-5 0h10m-10 0v4m10-4v4',
 start_at:'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM10 6v4l3 2',
 end_at:'M4 5h12v12H4ZM7 3v4m6-4v4M4 9h12m3 4 2 2 4-4',
 relations:'m8 12 4-4m-5 6-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m0 6a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-1 1',
};
export function PropertyIcon({name}:{name:string}){
 return <svg className="property-icon" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]??propertyKinds.find(k=>k.kind===name)?.icon??paths.relations}/></svg>;
}
