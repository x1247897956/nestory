import {useI18n} from "../../i18n";
export function SaveIndicator({
  busy,
  dirty,
  error,
}: {
  busy: boolean;
  dirty: boolean;
  error?: string;
}) {
  const {t}=useI18n();
  return (
    <div className="save-bar autosave-indicator">
      <span role="status">
        {busy
          ? t("保存中…")
          : error
            ? t("保存失败，草稿已保留")
            : dirty
              ? t("有未保存更改")
              : t("已保存")}
      </span>
    </div>
  );
}
