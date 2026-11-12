import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/** Browser-local preferences; a blocked or corrupt store must never block the view. */
export function useProjectPreferences<T>(projectId: string, scope: string, fallback: T, normalize: (raw: unknown) => T): [T, Dispatch<SetStateAction<T>>] {
 const key = `noteapp:view:${encodeURIComponent(projectId)}:${encodeURIComponent(scope)}`;
 const cache = useRef(new Map<string, T>());
 const [, refresh] = useState(0);
 useEffect(() => {
  const reset = () => { cache.current.clear(); refresh(version => version + 1); };
  window.addEventListener('noteapp:preferences-reset',reset);
  return () => window.removeEventListener('noteapp:preferences-reset',reset);
 },[]);
 if (!cache.current.has(key)) {
  let value = fallback;
  try {
   const stored = window.localStorage.getItem(key);
   if (stored !== null) value = normalize(JSON.parse(stored));
  } catch { /* Storage access, JSON and normalization can all fail independently. */ }
  cache.current.set(key, value);
 }
 const setValue = useCallback<Dispatch<SetStateAction<T>>>((update) => {
  const previous = cache.current.get(key) as T;
  const next = typeof update === 'function' ? (update as (previous: T) => T)(previous) : update;
  cache.current.set(key, next);
  try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* Keep the in-memory choice. */ }
  refresh(version => version + 1);
 }, [key]);
 return [cache.current.get(key) as T, setValue];
}
