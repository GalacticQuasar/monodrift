// Patch notes: parses docs/patch-notes.md (written by the patch-notes skill) for the
// /updates page and the in-game "updated" card. Pure: used by vite.config.ts at build
// time and by tests, never shipped as-is.
//
// Log format, per entry (newest first):
//   ## 2026-11-14                      heading = entry id (a date)
//   - Covers: … / - Last commit: …     bullets before the first section: internal, skipped
//   **Monodrift**: a minimal …         other paragraph lines: skipped
//   **Big new stuff**                  a line that is only bold text: a section
//   - **Settings**: one button …       items; "**Name**: text" gets the name as a lead-in

export interface NotesItem {
  /** Bold lead-in ("Settings"), if the item starts with "**Name**: ". */
  name: string | null;
  /** The rest, still in the log's markdown (may contain **bold**). */
  text: string;
}

export interface NotesSection {
  title: string;
  items: NotesItem[];
}

export interface NotesEntry {
  /** The heading, e.g. "2026-11-14"; also what the game remembers as seen. */
  id: string;
  sections: NotesSection[];
}

export function parsePatchNotes(md: string): NotesEntry[] {
  const entries: NotesEntry[] = [];
  let entry: NotesEntry | null = null;
  let section: NotesSection | null = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      entry = { id: heading[1].trim(), sections: [] };
      section = null;
      entries.push(entry);
      continue;
    }
    if (!entry) continue;
    const title = /^\*\*([^*]+)\*\*$/.exec(line);
    if (title) {
      section = { title: title[1].trim(), items: [] };
      entry.sections.push(section);
      continue;
    }
    const bullet = /^- (.+)$/.exec(line);
    if (!bullet || !section) continue; // metadata bullets, intro lines, blank lines
    const named = /^\*\*([^*]+)\*\*:\s*(.*)$/.exec(bullet[1]);
    section.items.push(named ? { name: named[1].trim(), text: named[2].trim() } : { name: null, text: bullet[1].trim() });
  }
  return entries.filter(e => e.sections.some(s => s.items.length));
}

/** Short summary for the in-game card: "Settings, Dark mode and more". */
export function headline(entry: NotesEntry): string {
  const items = entry.sections.flatMap(s => s.items);
  const names = items.flatMap(i => (i.name ? [i.name] : []));
  if (!names.length) return 'See what changed';
  const shown = names.slice(0, 2);
  if (items.length > shown.length) return `${shown.join(', ')} and more`;
  return shown.join(' and ');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escaped text with **bold** turned into <b>. */
const inline = (s: string) => escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

/** "one button now …" → "One button now ….": the log writes items as fragments. */
function sentence(s: string): string {
  const t = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.!?)]$/.test(t) ? t : `${t}.`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-14" → "November 14, 2026"; other headings unchanged. */
export function entryDate(id: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(id);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return id;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** The entries as HTML for the /updates page. */
export function renderPatchNotes(entries: NotesEntry[]): string {
  return entries
    .map(e => {
      const sections = e.sections
        .filter(s => s.items.length)
        .map(s => {
          const items = s.items.map(i => `<li>${i.name ? `<b>${escapeHtml(i.name)}.</b> ` : ''}${inline(sentence(i.text))}</li>`).join('\n');
          return `<section>\n<h3>${escapeHtml(s.title)}</h3>\n<ul>\n${items}\n</ul>\n</section>`;
        })
        .join('\n');
      return `<article id="${escapeHtml(e.id)}">\n<h2>${escapeHtml(entryDate(e.id))}</h2>\n${sections}\n</article>`;
    })
    .join('\n');
}
