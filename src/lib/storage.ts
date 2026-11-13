// localStorage can throw (private mode, blocked storage), so every access is guarded.

export const KEYS = {
  best: 'drift-best',
  mode: 'drift-mode',
  zen: 'drift-zen',
} as const;

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};
