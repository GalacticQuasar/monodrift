// localStorage can throw (private mode, blocked storage), so every access is guarded.

export const KEYS = {
  best: 'monodrift-best',
  mode: 'monodrift-mode',
  zen: 'monodrift-zen',
  /** Runs started, ever (for the install card). */
  runs: 'monodrift-runs',
  /** 'done' once the install card was used or dismissed. */
  install: 'monodrift-install',
  /** 'daily' to drive the daily road. */
  road: 'monodrift-road',
  /** Leaderboard identity: JSON {id, token, name}. */
  player: 'monodrift-player',
  /** 'skipped' once the name prompt after a run was skipped. */
  namePrompt: 'monodrift-name-prompt',
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
