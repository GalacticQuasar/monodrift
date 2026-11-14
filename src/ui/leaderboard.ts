// Leaderboard UI: the board panel (Today / All-time), the "pick a name" card shown
// after a first scored run, and posting each run's score with its ticket.

import { api, ApiError, player, type SubmitResult } from '../lib/api';
import { NAME_MAX, cleanName, nameProblem } from '../lib/names';
import { KEYS, storage } from '../lib/storage';

export interface Leaderboard {
  /** True while the board panel is open (game input should be ignored). */
  readonly open: boolean;
  /**
   * A scored run ended. Posts the score (if the player has a name) and calls `showRank`
   * with e.g. "#3 today · #12 all-time"; the first time, asks for a name instead.
   */
  runEnded(ticket: Promise<string | null>, score: number, showRank: (text: string) => void): void;
  /** A run started: put away the name card. */
  runStarted(): void;
}

/** Small DOM builder: element with properties (textContent, className, …) and children. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e: HTMLElementTagNameMap[K] = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

function rankText(r: SubmitResult): string {
  const all = r.all ? `#${r.all.rank} all-time` : '';
  return r.day ? `#${r.day.rank} today · ${all}` : all;
}

/**
 * Name input + Save button. Calls `save(name)`; shows its ApiError message (e.g. "name
 * taken") under the box, or calls `done` on success.
 */
function nameForm(label: string, initial: string, save: (name: string) => Promise<void>, done: () => void, extra?: HTMLElement) {
  const input = el('input', { type: 'text', value: initial, maxLength: NAME_MAX, placeholder: 'your name', spellcheck: false });
  input.setAttribute('autocomplete', 'nickname');
  input.setAttribute('aria-label', 'Leaderboard name');
  const error = el('p', { className: 'error' });
  const button = el('button', { type: 'submit', className: 'primary', textContent: label });
  const form = el('form', { className: 'name-form' }, el('div', { className: 'row' }, input, ...(extra ? [extra] : []), button), error);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = cleanName(input.value);
    const problem = nameProblem(name);
    if (problem) {
      error.textContent = problem;
      return;
    }
    button.disabled = true;
    error.textContent = '';
    try {
      await save(name);
      input.blur();
      done();
    } catch (err) {
      error.textContent = err instanceof ApiError ? err.message : 'something went wrong';
    } finally {
      button.disabled = false;
    }
  });
  return { form, input };
}

export function createLeaderboard(opts: {
  button: HTMLButtonElement;
  panel: HTMLElement;
  card: HTMLElement;
  /** The name card is about to show (e.g. hide other cards in the same spot). */
  onCardShown: () => void;
}): Leaderboard {
  const { button, panel, card } = opts;
  let isOpen = false;
  let tab: 'today' | 'all' = 'today';

  async function post(ticket: string, score: number, showRank: (text: string) => void) {
    try {
      showRank(rankText(await api.submit(ticket, score)));
    } catch {
      // rejected or offline: the run just doesn't count; nothing to show mid-game
    }
  }

  // ---- name card after a run ----
  function hideCard() {
    card.hidden = true;
    card.replaceChildren();
  }

  function askForName(ticket: string, score: number, showRank: (text: string) => void) {
    const skip = el('button', { type: 'button', textContent: 'Skip' });
    skip.addEventListener('click', () => {
      storage.set(KEYS.namePrompt, 'skipped');
      hideCard();
    });
    const { form } = nameForm(
      'Save',
      '',
      async name => {
        await api.register(name);
        await post(ticket, score, showRank);
      },
      hideCard,
      skip,
    );
    card.replaceChildren(el('b', { textContent: 'Put your score on the leaderboard?' }), el('p', { textContent: 'Pick a name. Your best runs will be posted from now on.' }), form);
    opts.onCardShown();
    card.hidden = false;
  }

  // ---- the board panel ----
  function close() {
    isOpen = false;
    panel.hidden = true;
    panel.replaceChildren();
    button.focus({ preventScroll: true });
    button.blur();
  }

  function nameSection(): HTMLElement {
    const me = player();
    const section = el('div', { className: 'you' });
    const showForm = () => {
      const { form, input } = nameForm(
        me ? 'Rename' : 'Join',
        me?.name ?? '',
        async name => {
          if (me) await api.rename(name);
          else await api.register(name);
          storage.set(KEYS.namePrompt, 'answered');
        },
        () => render(),
      );
      section.replaceChildren(el('p', { textContent: me ? 'New name:' : 'Pick a name to put your scores on the board. Runs from now on count.' }), form);
      input.focus();
    };
    if (me) {
      const change = el('button', { type: 'button', className: 'link', textContent: 'change' });
      change.addEventListener('click', showForm);
      section.append(el('p', {}, 'Playing as ', el('b', { textContent: me.name }), ' · ', change));
    } else {
      showForm();
    }
    return section;
  }

  async function render() {
    const tabs = el('div', { className: 'tabs' });
    for (const [id, label] of [['today', 'Today'], ['all', 'All-time']] as const) {
      const b = el('button', { type: 'button', textContent: label });
      b.setAttribute('aria-pressed', String(tab === id));
      b.addEventListener('click', () => {
        tab = id;
        render();
      });
      tabs.append(b);
    }
    const closeBtn = el('button', { type: 'button', className: 'close', textContent: '×' });
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', close);
    const list = el('div', { className: 'list' }, el('p', { className: 'status', textContent: 'Loading…' }));
    const note = el('p', { className: 'note', textContent: tab === 'today' ? "Today's road (Road: Daily) · new road at midnight UTC" : 'Best run on any road' });
    const box = el('div', { className: 'box', role: 'dialog', ariaModal: 'true', ariaLabel: 'Leaderboard' }, el('div', { className: 'head' }, el('b', { textContent: 'Leaderboard' }), closeBtn), tabs, note, list, nameSection());
    panel.replaceChildren(box);

    const shownTab = tab;
    try {
      const data = await api.board(tab);
      if (!isOpen || tab !== shownTab) return; // closed or switched tab meanwhile
      const rows = data.top.map(r =>
        el('li', { className: r.me ? 'me' : '' }, el('span', { className: 'rank', textContent: String(r.rank) }), el('span', { className: 'name', textContent: r.name }), el('span', { className: 'score', textContent: String(r.score) })),
      );
      // your own row, if you're on the board but below the top list
      if (data.me && !data.top.some(r => r.me)) {
        rows.push(el('li', { className: 'gap', textContent: '…' }));
        rows.push(el('li', { className: 'me' }, el('span', { className: 'rank', textContent: String(data.me.rank) }), el('span', { className: 'name', textContent: data.me.name }), el('span', { className: 'score', textContent: String(data.me.score) })));
      }
      list.replaceChildren(rows.length ? el('ol', {}, ...rows) : el('p', { className: 'status', textContent: tab === 'today' ? 'No runs on today’s road yet.' : 'No scores yet.' }));
    } catch (err) {
      if (!isOpen) return;
      list.replaceChildren(el('p', { className: 'status', textContent: err instanceof ApiError && err.status === 0 ? "Can't reach the leaderboard (offline?)" : 'The leaderboard is having trouble. Try again later.' }));
    }
  }

  button.addEventListener('click', () => {
    button.blur();
    hideCard();
    isOpen = true;
    panel.hidden = false;
    render();
  });
  panel.addEventListener('pointerdown', e => {
    if (e.target === panel) close(); // tap outside the box
  });
  addEventListener('keydown', e => {
    if (isOpen && e.key === 'Escape') close();
  });

  return {
    get open() {
      return isOpen;
    },
    async runEnded(ticketPromise, score, showRank) {
      if (score < 1) return;
      const ticket = await ticketPromise;
      if (!ticket) return; // offline when the run started
      if (player()) return post(ticket, score, showRank);
      if (!storage.get(KEYS.namePrompt)) askForName(ticket, score, showRank);
    },
    runStarted() {
      hideCard();
    },
  };
}
