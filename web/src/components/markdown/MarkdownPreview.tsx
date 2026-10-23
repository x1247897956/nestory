import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
export function MarkdownPreview({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="markdown-preview">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          li: ({ node, children, ...props }) => {
            const offset = node?.position?.start.offset;
            const tail = offset === undefined ? "" : value.slice(offset);
            const match = /^(?:[-+*]|\d+[.)])\s+\[([ xX])\]/.exec(tail);
            if (!match || offset === undefined)
              return <li {...props}>{children}</li>;
            const at = offset + match[0].length - 2;
            return (
              <li {...props}>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      (e.target as HTMLElement).tagName === "INPUT" &&
                      !disabled &&
                      onChange
                    )
                      onChange(
                        value.slice(0, at) +
                          (match[1] === " " ? "x" : " ") +
                          value.slice(at + 1),
                      );
                  }}
                >
                  {children}
                </span>
              </li>
            );
          },
          input: ({ checked }) => (
            <input
              type="checkbox"
              aria-label="检查项"
              checked={checked}
              disabled={disabled || !onChange}
              onChange={() => {}}
            />
          ),
          img: ({ src, alt }) =>
            src?.startsWith("/api/v1/assets/") ? (
              <img src={src} alt={alt} />
            ) : null,
          a: ({ href, children }) => (
            <a href={href} rel="noreferrer noopener" target="_blank">
              {children}
            </a>
          ),
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
