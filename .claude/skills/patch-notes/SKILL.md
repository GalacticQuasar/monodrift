---
name: patch-notes
description: Make Monodrift patch notes / an update page for players and friends (what's new since a date or since the last notes), published as an artifact page plus paste-ready text. Use when the user asks for patch notes, an update post, a changelog to share, or "what's new" for friends.
---

# Monodrift patch notes

Produces a shareable "what's new" page in the game's look (grey ground, white road
column, pixel display font) and the same list as plain text to paste in a message.
The audience is players and friends, not developers.

## 1. Find what changed

- Range: what the user says ("since 10pm yesterday"), else since the last entry in
  `docs/patch-notes.md` (its `last commit`). Use
  `git log <last-commit>..HEAD --reverse --format='%ad  %h  %s' --date=format:'%a %H:%M'`
  or `git log --since=...`. Check the timezone: `date` vs commit times.
- Read commit bodies (`git show --stat <hash>`) when a subject is unclear.

## 2. Write for players

- Describe what a player notices, in plain words: "Works offline: after your first
  visit you can play with no signal", not "service worker precache".
- Leave out internal work (refactors, docs, CI, tests, anti-cheat details, debug
  tools) unless it changes what players feel (e.g. "smoother frame rate").
- Group into these sections, skipping empty ones, most exciting item first:
  - **Big new stuff**: features and modes
  - **Controls and feel**: input, feel, fixes players would have hit
  - **Polish**: name, icons, visuals, small touches
- Bold the feature name at the start of an item (`<b>Leaderboard.</b> ...`).
- No "coming up" / roadmap section: the notes only cover what's already live.
- Same writing rules as the rest of the project: short, direct sentences; no
  em-dash asides or hype.

## 3. Build the page

- Copy `template.html` (next to this file) to the scratchpad and fill in:
  - `{{INTRO}}`: one sentence, e.g. "Here's everything new since last night."
  - `{{SECTIONS}}`: one block per section:
    ```html
      <section>
        <h2>Big new stuff</h2>
        <ul>
          <li><b>Leaderboard.</b> Pick a name after a run ...</li>
        </ul>
      </section>
    ```
  - `{{IMAGE_BASE64}}`: the game's preview image, shrunk and embedded (artifact
    pages can't load images from other sites):
    ```bash
    uv run --no-project --with pillow python -c "
    from PIL import Image
    Image.open('public/og.png').convert('L').resize((900, 472)).save('<scratch>/og-small.jpg', quality=80)"
    base64 -w0 <scratch>/og-small.jpg
    ```
    If a newer, better gameplay shot exists (e.g. showing a new feature), use that
    instead; CLAUDE.md explains how to render one with the autopilot.
- Keep the template's look; don't redesign it each time.

## 4. Publish and hand over

- Publish with the Artifact tool (`icon: "car"`, a one-sentence `description`).
  Title stays "Monodrift Update Notes" unless the user wants a dated one.
- The page is private: tell the user friends can't open it until they share it
  from the page's Share menu.
- Also give the same notes as paste-ready text in the reply (bold headers and
  dashes, the play link at the top).

## 5. Log it

Append an entry to `docs/patch-notes.md` (newest first): date, the last commit
covered, the artifact URL, and the paste-ready text. Commit it only when asked.
