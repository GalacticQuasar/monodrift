---
name: patch-notes
description: Make Monodrift patch notes / an update for players and friends (what's new since a date or since the last notes). They go on the website at /updates (from docs/patch-notes.md), plus paste-ready text. Use when the user asks for patch notes, an update post, a changelog to share, or "what's new" for friends.
---

# Monodrift patch notes

The notes live on the website: each entry in `docs/patch-notes.md` becomes a section
of https://monodrift.galacticquasar.dev/updates when it's deployed, and returning
players get a one-time "Monodrift was updated" card in the game linking there. You
also hand over the same list as plain text to paste in a message. The audience is
players and friends, not developers.

## 1. Find what changed

- Range: what the user says ("since 10pm yesterday"), else since the last entry in
  `docs/patch-notes.md` (its `last commit`). Use
  `git log <last-commit>..HEAD --reverse --format='%ad  %h  %s' --date=format:'%a %H:%M'`
  or `git log --since=...`. Check the timezone: `date` vs commit times.
- Read commit bodies (`git show --stat <hash>`) when a subject is unclear.
- Read the previous entry's text in `docs/patch-notes.md`. Players saw those notes,
  so when something they describe has moved, been renamed or changed, say so
  ("Road and Slide mode are now in Settings"), and don't announce as new anything
  that was already in them.

## 2. Write for players

- Describe what a player notices, in plain words: "Works offline: after your first
  visit you can play with no signal", not "service worker precache".
- Leave out internal work (refactors, docs, CI, tests, anti-cheat details, debug
  tools) unless it changes what players feel (e.g. "smoother frame rate").
- Group into these sections, skipping empty ones, most exciting item first:
  - **Big new stuff**: features and modes
  - **Controls and feel**: input, feel, fixes players would have hit
  - **Polish**: name, icons, visuals, small touches
- Start each item with the feature name in bold (`**Leaderboard**: pick a name ...`).
- No "coming up" / roadmap section: the notes only cover what's already live.
- Same writing rules as the rest of the project: short, direct sentences; no
  em-dash asides or hype.

## 3. Write the entry

Add the entry at the top of `docs/patch-notes.md` (newest first, under the intro).
The site is built from this file (`src/lib/patch-notes.ts` parses it; tests check
the real log still parses), so keep exactly this shape:

```markdown
## 2026-11-14

- Covers: `83924b4` to `2c0f0e7` (one-line summary)
- Last commit: `2c0f0e7`

**Monodrift**: a minimal top-down drift game. Play at https://monodrift.galacticquasar.dev
What's new: https://monodrift.galacticquasar.dev/updates

**Big new stuff**
- **Settings**: one Settings button now holds all the options. ...
- **Dark mode**: a night road with a white car. ...

**Controls and feel**
- ...
```

- The heading is the entry's id: today's date, `YYYY-MM-DD` (shown as "November 14,
  2026"). The game remembers the last id a player has seen, so a new heading is what
  triggers the in-game card. A second entry on the same day: `## 2026-11-14 (2)`.
- Bullets before the first section are internal (not shown on the site). Lines that
  aren't a bullet or a bold-only section title are skipped too, so the
  `**Monodrift**: ...` lines are only for the paste-ready text.
- Sections are a line that is only bold text. Items are `- **Name**: text`; the site
  shows "**Name.** Text." (capitalised, full stop added), so write the text as a
  fragment without a final full stop, like the examples.
- The card's summary comes from the first item names ("Settings, Dark mode and
  more"), so put the most exciting items first.
- Check it: `npm test` (the log must parse) and `npm run dev`, then open `/updates`.

## 4. Publish and hand over

- The notes go live when the entry is pushed to `main` (pushing deploys). Commit and
  push only when the user asks; the entry can go in the same push as the features or
  after them, never before (notes only cover what's live).
- Give the paste-ready text in the reply: bold headers and dashes, with the play
  link and the `/updates` link at the top (the same text as the entry, minus the
  internal bullets).
- No artifact page: the website is the only place the notes live.
