// Native API fixtures: Markdown parsing remains an explicit UI import operation.
export function block(type: string, text: string, props: Record<string, unknown> = {}) {
  return { id: crypto.randomUUID(), type, props, content: [{ type: "text", text, styles: {} }], children: [] };
}
export function documentOf(...blocks: ReturnType<typeof block>[]) {
  return { version: 1, blocks };
}
export function paragraphs(...texts: string[]) {
  return documentOf(...texts.map(text => block("paragraph", text)));
}
export function documentText(doc: any): string {
  const collect = (value: any): string => {
    if (Array.isArray(value)) return value.map(collect).join(" ");
    if (!value || typeof value !== "object") return "";
    return [value.text ?? "", collect(value.content), collect(value.children), collect(value.blocks)].filter(Boolean).join(" ");
  };
  return collect(doc).trim();
}
export function assetIDs(doc: any): string[] {
  const ids = new Set<string>();
  const visit = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.url === "string") {
      const id = value.url.match(/^\/api\/v1\/assets\/([a-f0-9]+)$/)?.[1];
      if (id) ids.add(id);
    }
    Object.values(value).forEach(visit);
  };
  visit(doc);
  return [...ids];
}
