import { getTabOwner } from "../../app/tabIdentity";
import { useEffect, useState } from "react";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type RecordDraft<T> = { schema: 1; owner?: string; draft: T; baseline: T; version: number; time: number };
const active = new Set<string>();
const storageError = "本地草稿保存失败；请保留此页面并复制内容后重试";
const conflictError = "检测到服务器更新或其他页面的未保存草稿，请复制内容或重新加载后处理冲突";

export function useAutosave<T>(
  initial: T,
  initialVersion: number,
  onSave: (snapshot: T, version: number) => Promise<unknown>,
  disabled = false,
  canSave: (draft: T) => boolean = () => true,
  storageKey?: string,
) {
  const [state] = useState(() => {
    const prefix = storageKey ? `noteapp:draft:${encodeURIComponent(storageKey)}:` : "";
    let owner = "";
    const ignoredKey = prefix + "ignored";
    let ignored: Record<string, string> = {};
    const instance = crypto.randomUUID();
    let ownKey = "";
    const recovered: { key: string; raw: string; value: RecordDraft<T> }[] = [];
    let error = "";
    let paused = false;
    if (prefix) {
      try {
        owner = getTabOwner();
        ownKey = prefix + owner + ":" + instance;
        ignored = JSON.parse(window.sessionStorage.getItem(ignoredKey) || "{}") as Record<string, string>;
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i)!;
          if (!key.startsWith(prefix)) continue;
          const raw = window.localStorage.getItem(key)!;
          if (ignored[key] === raw) continue;
          const value = JSON.parse(raw) as RecordDraft<T>;
          if (value.schema !== 1 || !("draft" in value) || !("baseline" in value) || !Number.isInteger(value.version))
            throw Error("Invalid recovery record");
          recovered.push({ key, raw, value });
        }
        recovered.sort((a, b) => Number(b.value.owner === owner) - Number(a.value.owner === owner) || b.value.time - a.value.time);
        paused = recovered.some(r => r.value.owner !== owner || active.has(r.key)) ||
          recovered.some(r => !equal(r.value.draft, recovered[0].value.draft)) ||
          recovered.some(r => !equal(r.value.draft, initial) &&
            (!equal(r.value.baseline, initial) || r.value.version !== initialVersion));
        if (paused) error = conflictError;
      } catch { error = storageError; paused = true; }
    }
    return {
      draft: recovered[0]?.value.draft ?? initial,
      baseline: initial, version: initialVersion, busy: false, error,
      paused, prefix, ownKey, owner, ignoredKey, ignored, recovered, discarded: false,
      disabled, onSave, canSave,
    };
  });
  const [, render] = useState(0);
  const refresh = () => render(n => n + 1);
  const s = state;
  s.onSave = onSave;
  s.disabled = disabled;
  s.canSave = canSave;

  const clearRecovered = () => {
    for (const record of s.recovered) {
      if (record.value.owner === s.owner && !active.has(record.key) && window.localStorage.getItem(record.key) === record.raw)
        window.localStorage.removeItem(record.key);
    }
    s.recovered = [];
  };
  const persist = () => {
    if (!s.ownKey || s.discarded) return;
    try {
      if (equal(s.draft, s.baseline)) window.localStorage.removeItem(s.ownKey);
      else window.localStorage.setItem(s.ownKey, JSON.stringify({
        schema: 1, owner: s.owner, draft: s.draft, baseline: s.baseline, version: s.version, time: Date.now(),
      } satisfies RecordDraft<T>));
    } catch { s.error = storageError; }
  };
  const setDraft = (value: T | ((old: T) => T)) => {
    s.draft = typeof value === "function" ? (value as (old: T) => T)(s.draft) : value;
    persist();
    // Once our own durable copy exists, retire inactive source records so a
    // later reload does not mistake our successive edits for competing tabs.
    if (!s.error && !s.paused) {
      try { clearRecovered(); } catch { s.error = storageError; }
    }
    refresh();
  };
  const save = async () => {
    if (s.busy || s.disabled || s.paused || !s.canSave(s.draft) || equal(s.draft, s.baseline)) return;
    s.busy = true;
    s.error = "";
    refresh();
    const snapshot = s.draft;
    try {
      await s.onSave(snapshot, s.version);
      s.baseline = snapshot;
      s.version++;
      if (!s.discarded) {
        // Write newer edits against the acknowledged baseline before removing recovery sources.
        persist();
        if (!s.error) {
          try { clearRecovered(); } catch { s.error = storageError; }
        }
      }
    } catch (e) { s.error = e instanceof Error ? e.message : String(e); }
    finally { s.busy = false; refresh(); }
  };
  const discardRecovery = () => {
    try {
      // A confirmed reload dismisses foreign records for this tab only.
      // Preserve their exact content so any subsequent foreign edit reappears.
      if (s.prefix) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i)!;
          if (!key.startsWith(s.prefix)) continue;
          const raw = window.localStorage.getItem(key)!;
          const value = JSON.parse(raw) as RecordDraft<T>;
          if (value.owner !== s.owner || active.has(key) && key !== s.ownKey)
            s.ignored[key] = raw;
        }
        window.sessionStorage.setItem(s.ignoredKey, JSON.stringify(s.ignored));
      }
      clearRecovered();
      if (s.ownKey) window.localStorage.removeItem(s.ownKey);
      s.discarded = true;
    } catch {
      s.error = storageError;
      refresh();
      throw new Error(storageError);
    }
  };
  const candidate = s.recovered[0]?.value;
  const canRecover = s.paused && !s.disabled && !s.discarded && !!candidate &&
    equal(candidate.baseline, s.baseline) && candidate.version === s.version;
  const recover = () => {
    if (!canRecover) return;
    // Adoption is explicit, but still requires a durable copy owned by this
    // tab before unlocking writes. Foreign records always remain untouched.
    s.error = "";
    persist();
    if (s.error) { refresh(); return; }
    try {
      const dismissed = { ...s.ignored };
      for (const record of s.recovered) {
        if (record.value.owner !== s.owner || active.has(record.key))
          dismissed[record.key] = record.raw;
      }
      window.sessionStorage.setItem(s.ignoredKey, JSON.stringify(dismissed));
      s.ignored = dismissed;
      s.paused = false;
      clearRecovered();
    } catch {
      s.paused = true;
      s.error = storageError;
    }
    refresh();
  };
  const dirty = !equal(s.draft, s.baseline);
  useEffect(() => {
    if (!dirty || s.busy || s.error || disabled) return;
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [s.draft, s.baseline, s.busy, s.error, disabled]);
  useEffect(() => {
    active.add(s.ownKey);
    // A committed draft from a lost acknowledgement needs no recovery.
    if (!s.paused && equal(s.draft, s.baseline)) {
      try { clearRecovered(); } catch { s.error = storageError; refresh(); }
    }
    const listener = (e: BeforeUnloadEvent) => {
      if (!equal(s.draft, s.baseline) || s.busy) { e.preventDefault(); e.returnValue = ""; }
    };
    const storageListener = (event: StorageEvent) => {
      if (s.prefix && event.key?.startsWith(s.prefix) && event.key !== s.ownKey && event.newValue) {
        s.paused = true;
        s.error = conflictError;
        refresh();
      }
    };
    window.addEventListener("storage", storageListener);
    window.addEventListener("beforeunload", listener);
    return () => { active.delete(s.ownKey); window.removeEventListener("storage", storageListener); window.removeEventListener("beforeunload", listener); };
  }, []);
  return { draft: s.draft, setDraft, version: s.version, busy: s.busy, error: s.error, dirty, save, discardRecovery, canRecover, recover };
}
