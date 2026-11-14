// localStorage can throw (private mode, blocked storage), so every access is guarded.

export const KEYS = {
  best: 'monodrift-best',
  mode: 'monodrift-mode',
  zen: 'monodrift-zen',
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
