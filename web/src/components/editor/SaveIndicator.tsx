export function SaveIndicator({
  busy,
  dirty,
  error,
}: {
  busy: boolean;
  dirty: boolean;
  error?: string;
}) {
  return (
    <div className="save-bar autosave-indicator">
      <span role="status">
        {busy
          ? "保存中…"
          : error
            ? "保存失败，草稿已保留"
            : dirty
              ? "有未保存更改"
              : "已保存"}
      </span>
    </div>
  );
}
