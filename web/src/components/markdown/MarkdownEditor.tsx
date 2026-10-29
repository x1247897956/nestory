import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from 'react';

// Keep the native editor and its schema/plugins out of collection and dashboard startup.
const NativeEditor = lazy(() => import('./BlockEditor').then(module => ({default: module.BlockEditor})));
type Props = ComponentProps<typeof import('./BlockEditor').BlockEditor>;

class EditorLoadBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
 state = {failed: false};
 static getDerivedStateFromError() { return {failed: true}; }
 render() {
  if (this.state.failed) return <div role="alert">编辑器加载失败，正文尚未改动。<button type="button" onClick={() => window.location.reload()}>重新加载页面</button></div>;
  return this.props.children;
 }
}
export function MarkdownEditor(props: Props) {
 return <EditorLoadBoundary><Suspense fallback={<p role="status">正在加载编辑器…</p>}><NativeEditor {...props}/></Suspense></EditorLoadBoundary>;
}
