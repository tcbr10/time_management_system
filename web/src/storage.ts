import { useCallback, useState } from 'react';

/** useState persisted in localStorage, for display preferences such as hidden calendars. */
export function useStored<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private browsing or a full quota: the preference just won't survive a reload.
      }
    },
    [key],
  );
  return [value, set];
}
