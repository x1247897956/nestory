import type {ReactNode} from 'react';
import {SaveIndicator} from '../markdown/SaveIndicator';
import './object-editor.css';

export function ObjectEditorHeader({title, menu, properties, children}: {title:string; menu:ReactNode; properties:ReactNode; children:ReactNode}) {
  return <header className="task-inline-header object-editor-header"><div className="object-title-row"><h2 aria-label={title}>{children}</h2>{menu}</div>{properties}</header>;
}
export function ObjectEditorBody({children}: {children:ReactNode}) {
  return <div className="body-label object-editor-body">{children}</div>;
}
export function ObjectEditorFooter({busy, dirty, error, validation, children}: {busy:boolean;dirty:boolean;error?:string;validation?:ReactNode;children?:ReactNode}) {
  return <footer className="object-editor-footer">{validation}<SaveIndicator busy={busy} dirty={dirty} error={error}/>{children}</footer>;
}
