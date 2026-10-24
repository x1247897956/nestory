import { useEffect, useRef, useState } from "react";
export function useAutosave<T>(
  initial: T,
  initialVersion: number,
  onSave: (snapshot: T, version: number) => Promise<unknown>,
  disabled = false,
  canSave: (draft: T) => boolean = () => true,
) {
  const [draft, setDraftState] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = useRef({
    draft: initial,
    baseline: initial,
    version: initialVersion,
    busy: false,
    error: "",
    disabled,
    onSave,
    canSave,
  });
  const s = state.current;
  s.onSave = onSave;
  s.disabled = disabled;
  s.canSave = canSave;
  const setDraft = (value: T | ((old: T) => T)) => {
    const next =
      typeof value === "function" ? (value as (old: T) => T)(s.draft) : value;
    s.draft = next;
    setDraftState(next);
  };
  const save = async () => {
    if (
      s.busy ||
      s.disabled ||
      !s.canSave(s.draft) ||
      JSON.stringify(s.draft) === JSON.stringify(s.baseline)
    )
      return;
    s.busy = true;
    s.error = "";
    setBusy(true);
    setError("");
    const snapshot = s.draft;
    try {
      await s.onSave(snapshot, s.version);
      s.baseline = snapshot;
      s.version++;
      setBaseline(snapshot);
      setVersion(s.version);
    } catch (e) {
      s.error = (e as Error).message;
      setError(s.error);
    } finally {
      s.busy = false;
      setBusy(false);
    }
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => {
    if (!dirty || busy || error || disabled) return;
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [draft, baseline, busy, error, disabled]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(s.draft) !== JSON.stringify(s.baseline) || s.busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, []);
  return { draft, setDraft, version, busy, error, dirty, save };
}
