// Leaderboard name rules, shared by the game (instant feedback) and the server (the
// real check).

export const NAME_MIN = 2;
export const NAME_MAX = 16;

/** Small list of words not allowed anywhere in a name (checked without spaces/symbols). */
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'bitch', 'whore', 'slut', 'admin', 'moderator'];

/** Trims and collapses spaces. */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** null if the (cleaned) name is fine, otherwise a short reason to show the player. */
export function nameProblem(name: string): string | null {
  if (name.length < NAME_MIN) return `at least ${NAME_MIN} characters`;
  if (name.length > NAME_MAX) return `at most ${NAME_MAX} characters`;
  if (!/^[A-Za-z0-9 _.-]+$/.test(name)) return 'letters, numbers, spaces and _ . - only';
  const squashed = name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's');
  if (BLOCKED.some(w => squashed.includes(w))) return 'please pick another name';
  return null;
}
