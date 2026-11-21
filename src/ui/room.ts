// The room card (multiplayer): picking a name, joining, the lobby (who's here, who's
// ready, which road), the results after a round, and errors. Sits in the bottom card
// spot; hidden while a round is on.

import { DESKTOP } from '../lib/device';
import { cleanName, nameProblem, NAME_MAX } from '../lib/names';
import type { RoadKind, RoomView } from '../lib/room-protocol';
import type { RoomSession, SessionError } from '../net/room-session';
import { trophyIcon } from './win';

export interface RoomCard {
  /** Ask for a name before joining (players without a leaderboard name). */
  askName(initial: string, submit: (name: string) => void): void;
  /** Making a new room (waiting for the server). */
  showCreating(): void;
  /** Creating a room failed. */
  showCreateFailed(message: string): void;
  /** Show the session as it is now (call on every change). Hidden during a round. */
  render(s: RoomSession): void;
  /** Keep the card out of the way for `ms` (the win trophy is playing), then show `s`. */
  holdFor(ms: number, s: RoomSession): void;
  hide(): void;
  readonly shown: boolean;
}

export interface RoomCardActions {
  ready(ready: boolean): void;
  road(road: RoadKind): void;
  /** Leave the room (or stop joining one). */
  leave(): void;
  /** Try making a room again, after it failed. */
  retryCreate(): void;
  /**
   * Name to offer as the player's leaderboard name on the results card (their room
   * name), or null when not to offer (they have one, or said no before).
   */
  leaderboardOffer(): string | null;
  /** Register `name` on the leaderboard; rejects with a message to show. */
  saveLeaderboardName(name: string): Promise<void>;
  /** Not now: don't offer again. */
  declineLeaderboard(): void;
}

const ERRORS: Record<SessionError, string> = {
  'no-room': 'This room has closed. Make a new one from the start screen.',
  full: 'This room is full.',
  version: 'Monodrift was updated. Reload to join the room.',
  'bad-message': 'Something went wrong in the room.',
  offline: "Can't reach the room. Check your connection.",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e: HTMLElementTagNameMap[K] = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

function button(text: string, onClick: () => void, props: Record<string, unknown> = {}): HTMLButtonElement {
  const b = el('button', { type: 'button', textContent: text, ...props });
  b.addEventListener('click', () => {
    b.blur();
    onClick();
  });
  return b;
}

export const roomLink = (code: string) => `${location.origin}/?room=${code}`;

export function createRoomCard(card: HTMLElement, act: RoomCardActions): RoomCard {
  /** Remembered between renders so a re-render doesn't undo "Copied!". */
  let copiedUntil = 0;
  /** Date.now() until which the card stays hidden (see holdFor). */
  let heldUntil = 0;
  let holdTimer = 0;

  function show(title: string, ...body: Node[]) {
    const leave = button('×', act.leave, { className: 'close', ariaLabel: 'Leave room' });
    card.replaceChildren(el('div', { className: 'head' }, el('b', { textContent: title }), leave), ...body);
    card.hidden = false;
  }

  function inviteButton(code: string): HTMLButtonElement {
    const share = !DESKTOP && 'share' in navigator;
    const b = button(Date.now() < copiedUntil ? 'Copied!' : share ? 'Invite' : 'Copy link', async () => {
      const url = roomLink(code);
      if (share) {
        try {
          await navigator.share({ title: 'Monodrift', text: `Drive with me in Monodrift (room ${code})`, url });
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return; // closed the share sheet
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        copiedUntil = Date.now() + 1500;
        b.textContent = 'Copied!';
        setTimeout(() => b.isConnected && (b.textContent = share ? 'Invite' : 'Copy link'), 1500);
      } catch {
        prompt('Send this link to a friend:', url);
      }
    });
    return b;
  }

  /** A room setting: label and two choices, the current one pressed. */
  function choiceRow<T>(label: string, options: readonly (readonly [T, string])[], value: T, pick: (v: T) => void): HTMLElement {
    const seg = el('div', { className: 'seg', role: 'group', ariaLabel: label });
    for (const [v, text] of options) {
      const b = button(text, () => value !== v && pick(v));
      b.setAttribute('aria-pressed', String(value === v));
      seg.append(b);
    }
    return el('div', { className: 'setting' }, el('span', { className: 'label', textContent: label }), seg);
  }

  /** Road, win rule and (last standing) what the winner does: anyone can change them between rounds. */
  function settingRows(s: RoomSession, room: RoomView): HTMLElement[] {
    const rows = [
      choiceRow<RoadKind>('Road', [['random', 'Random'], ['daily', 'Daily']], room.road, v => s.setRoad(v)),
      choiceRow('Win', [['furthest', 'Furthest'], ['last', 'Last standing']] as const, room.win, v => s.setRules(v, room.drivesOn)),
    ];
    if (room.win === 'last') rows.push(choiceRow('Winner', [[false, 'Stops'], [true, 'Drives on']] as const, room.drivesOn, v => s.setRules('last', v)));
    return rows;
  }

  function render(s: RoomSession) {
    const title = `Room ${s.code}`;
    if (s.status === 'failed') {
      const fix =
        s.error === 'version'
          ? button('Reload', () => location.reload(), { className: 'primary' })
          : button('OK', act.leave, { className: 'primary' });
      return show(title, el('p', { textContent: ERRORS[s.error ?? 'offline'] }), el('div', { className: 'buttons' }, fix));
    }
    const room = s.room;
    if (s.status !== 'open' || !room) {
      return show(title, el('p', { textContent: s.status === 'reconnecting' ? 'Connection lost, reconnecting…' : 'Joining…' }));
    }
    if (room.phase === 'racing') return hide();
    if (Date.now() < heldUntil) return hide();

    const me = room.players.find(p => p.id === s.you);
    const alone = room.players.length < 2;
    // results only for those who drove that round; someone who joined since sees the lobby
    const results = room.phase === 'results' && me?.status === 'crashed';
    // results: best score first; lobby: as they joined
    const players = results ? [...room.players].sort((a, b) => b.score - a.score) : room.players;
    const list = el(
      'ol',
      { className: results ? 'players ranked' : 'players' },
      ...players.map(p =>
        el(
          'li',
          { className: p.id === s.you ? 'me' : '' },
          ...(results && p.id === room.winner ? [trophyIcon()] : []),
          el('span', { className: 'name', textContent: p.name + (p.id === s.you ? ' (you)' : '') }),
          el('span', { className: 'state', textContent: results && p.status === 'crashed' ? String(p.score) : '' }),
          el('span', { className: 'dot' + (p.ready ? ' on' : ''), title: p.ready ? 'ready' : 'not ready' }),
        ),
      ),
    );
    const others = room.players.filter(p => p.id !== s.you);
    const note = alone
      ? 'Send the link to a friend. You can also drive alone.'
      : me?.ready
        ? `Waiting for ${others.filter(p => !p.ready).map(p => p.name).join(', ')}…`
        : others.every(p => p.ready)
          ? `${others.map(p => p.name).join(', ')} ${others.length > 1 ? 'are' : 'is'} ready.`
          : 'Starts when everyone is ready.';
    const ready = button(alone ? 'Start' : results ? 'Again' : 'Ready', () => s.setReady(!me?.ready), { className: 'primary' });
    ready.setAttribute('aria-pressed', String(!!me?.ready));
    if (me?.ready) ready.textContent = 'Ready!';

    show(
      results ? resultsTitle(s, room) : title,
      list,
      ...settingRows(s, room),
      el('p', { textContent: note }),
      ...(results ? leaderboardLine() : []),
      el('div', { className: 'buttons' }, inviteButton(room.code), ready),
    );
  }

  /** "Put your scores on the leaderboard as Mo?" for players without a leaderboard name. */
  function leaderboardLine(): HTMLElement[] {
    const name = act.leaderboardOffer();
    if (!name) return [];
    const text = el('span', { textContent: `Put your scores on the leaderboard as ${name}? ` });
    const save = button('Save', async () => {
      save.disabled = true;
      try {
        await act.saveLeaderboardName(name);
        line.replaceChildren(`Saved: your scores go on the leaderboard as ${name}.`);
      } catch (e) {
        save.disabled = false;
        text.textContent = `Couldn't save ${name}: ${(e as Error).message}. Pick another name in Leaderboard. `;
      }
    }, { className: 'link' });
    const no = button('No thanks', () => {
      act.declineLeaderboard();
      line.remove();
    }, { className: 'link' });
    const line = el('p', { className: 'offer' }, text, save, ' · ', no);
    return [line];
  }

  function resultsTitle(s: RoomSession, room: RoomView): string {
    const w = room.players.find(p => p.id === room.winner);
    if (!w) return `Round ${room.round}`;
    return w.id === s.you ? 'You win!' : `${w.name} wins!`;
  }

  function hide() {
    card.hidden = true;
    card.replaceChildren();
  }

  return {
    askName(initial, submit) {
      const input = el('input', { type: 'text', value: initial, maxLength: NAME_MAX, placeholder: 'your name', spellcheck: false });
      input.setAttribute('autocomplete', 'nickname');
      input.setAttribute('aria-label', 'Your name in the room');
      const error = el('p', { className: 'error' });
      const go = el('button', { type: 'submit', className: 'primary', textContent: 'Go' });
      const form = el('form', { className: 'name-form' }, el('div', { className: 'row' }, input, go), error);
      form.addEventListener('submit', e => {
        e.preventDefault();
        const name = cleanName(input.value);
        const problem = nameProblem(name);
        if (problem) {
          error.textContent = problem;
          return;
        }
        input.blur();
        submit(name);
      });
      show('Drive with a friend', el('p', { textContent: 'Pick a name your friend will see.' }), form);
      if (DESKTOP) input.focus({ preventScroll: true });
    },
    showCreating() {
      show('Drive with a friend', el('p', { textContent: 'Making a room…' }));
    },
    showCreateFailed(message) {
      show('Drive with a friend', el('p', { textContent: `Couldn't make a room: ${message}.` }), el('div', { className: 'buttons' }, button('Try again', act.retryCreate, { className: 'primary' })));
    },
    render,
    holdFor(ms, s) {
      heldUntil = Date.now() + ms;
      clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => render(s), ms + 20);
      hide();
    },
    hide,
    get shown() {
      return !card.hidden;
    },
  };
}
