import './style.css';
import { COLORS, MAX_FRAME_TIME, NET, SIM_HZ, SPEED, TRACK, UI } from './config';
import { createInput } from './input/input';
import { DESKTOP } from './lib/device';
import { KEYS, storage } from './lib/storage';
import { startLoop } from './loop';
import { ALL_LAYERS, createRenderer, type View } from './render/renderer';
import { api, ApiError, player } from './lib/api';
import { isRoomCode, normalizeCode, type RoomView } from './lib/room-protocol';
import { createRoomSession, type RoomSession } from './net/room-session';
import { createRoomCard } from './ui/room';
import { createWin } from './ui/win';
import { createRunRecorder } from './lib/run-recorder';
import { createBot } from './net/bot';
import type { Rival } from './net/rivals';
import { extendTrack } from './sim/track';
import { dailySeed, utcDay } from './sim/daily';
import { crashedAtStart, createGame, step } from './sim/game';
import { autoHideCursor } from './ui/cursor';
import { createDebug, debugLayers } from './ui/debug';
import { createEgg } from './ui/egg';
import { createHud } from './ui/hud';
import { createInstallPrompt } from './ui/install';
import { createLeaderboard } from './ui/leaderboard';
import { createNews } from './ui/news';
import { createSettings, sensitivityFactor } from './ui/settings';
import { watchTheme } from './ui/theme';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

const canvas = $<HTMLCanvasElement>('#c');
// layers drawn; the Trees setting adds/removes 'trees' unless ?render=… chose them
const fixedLayers = debugLayers();
const layers = fixedLayers ?? new Set(ALL_LAYERS);
const renderer = createRenderer(canvas, COLORS.light, layers); // palette set by watchTheme below
const hud = createHud($('#score'), $('#msg'));
const egg = createEgg($('#egg'), canvas);
const win = createWin($('#win'));
const debug = createDebug();
/** The player's run as pose samples (sent to a room; later, saved as a ghost). */
const recorder = createRunRecorder();
/** Debug rival on the player's road (?debug&bot). */
const bot = debug && new URLSearchParams(location.search).has('bot') ? createBot() : null;
const botRivals: Rival[] = bot ? [bot.rival] : [];
/** Other cars for the renderer (reused every frame): the room's rivals while in one. */
const view: View = { rivals: botRivals, follow: null, carColor: null, boom: { x: 0, y: 0, at: -1 } }; // carColor: set from Settings below
autoHideCursor();
const install = createInstallPrompt($('#install'));
const news = createNews($('#news'), __LATEST_NOTES__);
const leaderboard = createLeaderboard({
  button: $('#lb'),
  panel: $('#board'),
  card: $('#join'),
  onCardShown: () => {
    install.hide();
    news.hide();
  },
});

/** Local best is kept per speed, so Slow runs don't set the Normal best (room runs are Normal). */
const bestKey = () => {
  const speed = session ? (ROOM_RULES.uncapped ? 'uncapped' : 'normal') : settings.speed;
  return speed === 'normal' ? KEYS.best : `${KEYS.best}-${speed}`;
};
const loadBest = () => Number(storage.get(bestKey())) || 0;
/** performance.now() before which a tap won't start a new run. */
let retryAllowedAt = 0;
/** Run frozen because Settings was opened mid-run; the next tap/key after it closes resumes. */
let paused = false;
/** Leaderboard ticket for the current run (null: zen, not Normal speed, or offline when it started). */
let ticket: Promise<string | null> = Promise.resolve(null);
/** The room the player is in, if any (?room=CODE in the URL while in one). */
let session: RoomSession | null = null;
/** Room round counting down: performance.now() when it goes (0: none), and its details. */
let countdown = { goAt: 0, round: 0, seed: 0, daily: false, startX: 0, shown: 0 };
/** In a room but not in the current round (joined mid-round, or lost the connection). */
let watching = false;
/** The last room run of a player without a leaderboard name: posted if they save one. */
let lastRoomRun: { ticket: Promise<string | null>; score: number } | null = null;
/** Counts "Drive with a friend" attempts, so one abandoned meanwhile is dropped. */
let roomAttempt = 0;

function showReady() {
  paused = false;
  input.clear();
  egg.hide();
  win.hide();
  bot?.stop();
  game = createGame(roadSeed());
  if (session) {
    // in a room: its card is the menu; rounds start from the room
    hud.hideMessage();
    return;
  }
  showStart();
  menuCards();
}

const showStart = () => hud.showStart(settings.mode, settings.zen, settings.daily, settings.speed);

/** Cards in the bottom spot on a menu screen: "updated" first, else "add to home screen". */
function menuCards() {
  if (!news.maybeShow()) install.maybeShow();
}

const settings = createSettings($('#settings-btn'), $('#settings'), changed => {
  if (changed === 'zen' || changed === 'daily' || changed === 'speed') {
    // ends the current run: no carrying a zen or Slow run into a scored one (zen runs
    // never end on their own, so this is the way out), and a new road needs a new run
    showReady();
  } else if (changed === 'mode') {
    input.clear();
    if (game.phase === 'ready') showStart();
  } else if (changed === 'trees') {
    applyTrees();
  } else if (changed === 'dark') {
    updateTheme();
  } else if (changed === 'car') {
    view.carColor = carColorId();
    session?.setColor(view.carColor);
  }
}, open => {
  // a room run isn't paused: everyone else keeps driving
  if (open && game.phase === 'run' && !session) {
    paused = true;
    input.clear();
    debug?.event('pause');
  } else if (!open && paused) {
    hud.showPaused(); // resuming the moment the panel closes would crash the car before you're ready
  }
}, () => (session ? leaveRoom() : openFriends()));

/** The car colour as sent to rooms and the renderer (null: default). */
const carColorId = () => (settings.car === 'default' ? null : settings.car);
view.carColor = carColorId();

const updateTheme = watchTheme(
  () => settings.dark,
  colors => renderer.setPalette(colors),
);

function applyTrees() {
  if (fixedLayers) return;
  if (settings.trees) layers.add('trees');
  else layers.delete('trees');
}
applyTrees();

/** Today's road (same for everyone, by UTC day) or a random one. */
const roadSeed = () => (settings.daily ? dailySeed(utcDay(Date.now())) : randomSeed());
let game = createGame(roadSeed());
let best = loadBest();

const input = createInput(canvas, {
  mode: () => settings.mode,
  sensitivity: () => sensitivityFactor(settings.sensitivity),
  pointerSteer: !DESKTOP,
  onAction: () => {
    if (leaderboard.open || settings.open) return false;
    if (paused) {
      paused = false;
      hud.hideMessage();
      debug?.event('resume');
      return true;
    }
    if (game.phase === 'run') return false;
    if (session && game.phase === 'over' && session.room?.phase === 'racing') {
      switchFollow(); // out of the round: a tap/key watches the next car still driving
      return true;
    }
    if (session || roomCard.shown) return true; // rounds start from the room, not a tap
    if (performance.now() < retryAllowedAt) return true; // swallow the tap
    // from the start screen, drive the road already on screen; a retry gets a new one
    const ranked = !settings.zen && settings.speed === 'normal';
    startRun(game.phase === 'ready' ? game.seed : roadSeed(), ranked, settings.daily);
    return true;
  },
});

/** Start driving road `seed`. `ranked`: get a leaderboard ticket (Normal speed, no zen). */
function startRun(seed: number, ranked: boolean, daily: boolean, startX = 0) {
  game = createGame(seed, 'run', startX);
  recorder.start(game);
  bot?.start(game.seed);
  // the server times the run from here, which caps the score it will accept
  best = loadBest();
  ticket = ranked ? api.ticket(game.seed, daily).catch(() => null) : Promise.resolve(null);
  hud.hideMessage();
  egg.hide();
  install.runStarted();
  news.hide();
  leaderboard.runStarted();
  debug?.event('start');
}

/** Room rounds: Normal pace, crashes on, whatever the player's settings say; Uncapped if the room says so (set per round). */
const ROOM_RULES = { crash: true, speed: 1, uncapped: false };

function tick(dt: number) {
  if (paused) return;
  const rules = session ? ROOM_RULES : { crash: !settings.zen, speed: SPEED[settings.speed], uncapped: settings.speed === 'uncapped' };
  bot?.tick(dt, rules);
  if (game.phase !== 'run') return;
  const event = step(game, input.intent(), dt, rules);
  if (event === 'boom') sonicBoom();
  const crashed = event === 'crash';
  recorder.record(game, crashed);
  session?.sendPoses(recorder.log);
  if (crashed) runEnded();
}

/** Uncapped broke the sound barrier: a shockwave from the car, and the screen shakes. */
function sonicBoom() {
  view.boom.x = game.car.x;
  view.boom.y = game.car.y;
  view.boom.at = performance.now();
  canvas.classList.remove('egg-shake');
  void canvas.offsetWidth; // restart the shake
  canvas.classList.add('egg-shake');
  debug?.event('sonic boom');
}

/** The run is over (crashed, or a room run cut short). */
function runEnded() {
  if (session) return roomRunEnded();
  const backwards = crashedAtStart(game);
  const retryDelay = backwards ? UI.eggRetryDelayMs : UI.retryDelayMs;
  retryAllowedAt = performance.now() + retryDelay;
  const newBest = game.score > best;
  if (newBest) {
    best = game.score;
    storage.set(bestKey(), String(best));
  }
  hud.showGameOver(game.score, best, retryDelay);
  if (backwards) egg.show();
  menuCards();
  const ended = game;
  leaderboard.runEnded(ticket, game.score, text => {
    if (game === ended) hud.showRank(text); // still on this run's game-over screen
  });
  if (debug) {
    debug.event((backwards ? 'crash into the start' : 'crash') + (newBest ? ' (new best saved)' : ''));
    setTimeout(() => debug.event('retry hint fades in'), retryDelay);
  }
}

/** Rivals still driving when the spectating line was last updated (no garbage: counted, not filtered). */
let racingShown = 0;

/** After the player crashes, the camera follows a rival still racing (spectating). */
function updateFollow() {
  const prev = view.follow;
  // stay on whoever we're watching until they crash, then switch to the leader
  let f: Rival | null = null;
  if (game.phase === 'over') {
    if (prev && prev.state === 'racing' && view.rivals.includes(prev)) f = prev;
    else for (const r of view.rivals) if (r.state === 'racing' && (!f || r.pose.i > f.pose.i)) f = r;
  }
  view.follow = f;
  // the road ahead of them may not exist yet: it's only generated around the player
  if (f) extendTrack(game.track, f.pose.i + TRACK.pointsAhead);
  // who's left changed (someone crashed, or we switched): update "watching …" and the switch hint
  let racing = 0;
  for (const r of view.rivals) if (r.state === 'racing') racing++;
  if (session && (f !== prev || racing !== racingShown) && game.phase === 'over' && session.room?.phase === 'racing') showRoomSpectating();
  racingShown = racing;
}

// ---- multiplayer rooms ----


const roomCard = createRoomCard($('#room'), {
  ready: r => session?.setReady(r),
  road: r => session?.setRoad(r),
  leave: () => leaveRoom(),
  retryCreate: () => startRoom(),
  leaderboardOffer: () => (player() || storage.get(KEYS.namePrompt) ? null : storage.get(KEYS.roomName)),
  async saveLeaderboardName(name) {
    await api.register(name);
    // the round just driven counts too (its ticket is still unused)
    if (lastRoomRun) leaderboard.runEnded(lastRoomRun.ticket, lastRoomRun.score, () => {});
    lastRoomRun = null;
  },
  declineLeaderboard: () => storage.set(KEYS.namePrompt, 'skipped'),
});

/** "Drive with a friend": the card to join a room by code or make a new one. */
function openFriends() {
  if (session) return;
  roomAttempt++; // drops a room still being made from an earlier tap
  hideMenuCards();
  hud.hideMessage();
  roomCard.showStart(joinByCode, startRoom);
}

/** A code typed on the card: check the room is there with a seat, then join. Returns a problem to show, or null. */
async function joinByCode(code: string): Promise<string | null> {
  const attempt = roomAttempt;
  let info;
  try {
    info = await api.roomInfo(code);
  } catch (e) {
    return e instanceof ApiError ? `${e.message[0].toUpperCase()}${e.message.slice(1)}.` : 'Something went wrong.';
  }
  if (attempt !== roomAttempt || session) return null; // closed the card meanwhile
  if (!info.open) return 'No room with that code. It may have closed.';
  if (info.full) return 'That room is full.';
  history.replaceState(null, '', `?${roomParam(code)}`);
  joinRoom(code);
  return null;
}

/** "New room": make a room, then join it. */
async function startRoom() {
  if (session) return;
  const attempt = ++roomAttempt;
  hideMenuCards();
  hud.hideMessage();
  roomCard.showCreating();
  try {
    const code = await api.createRoom();
    if (attempt !== roomAttempt) return; // closed the card meanwhile
    history.replaceState(null, '', `?${roomParam(code)}`);
    joinRoom(code);
  } catch (e) {
    if (attempt === roomAttempt) roomCard.showCreateFailed(e instanceof ApiError ? e.message : 'something went wrong');
  }
}

/** The URL's query string with ?room= set to `code` (other params, like debug, kept). */
function roomParam(code: string | null): string {
  const q = new URLSearchParams(location.search);
  if (code) q.set('room', code);
  else q.delete('room');
  return q.toString().replace(/=(?=&|$)/g, ''); // ?debug, not ?debug=
}

function joinRoom(code: string) {
  const name = player()?.name ?? storage.get(KEYS.roomName);
  hideMenuCards();
  if (!name) {
    hud.hideMessage();
    roomCard.askName('', n => {
      storage.set(KEYS.roomName, n);
      joinRoom(code);
    });
    return;
  }
  session?.close();
  session = createRoomSession(code, name, carColorId(), { onChange: roomChanged, onStart: roundStarting });
  view.rivals = session.rivals;
  bot?.stop();
  settings.setInRoom(true);
  hud.setFriendLink(null);
  watching = false;
  if (game.phase === 'run') game.phase = 'over'; // can't carry a solo run into the room
  showReady();
  roomChanged();
}

function leaveRoom() {
  roomAttempt++;
  session?.close();
  session = null;
  countdown.goAt = 0;
  watching = false;
  view.rivals = botRivals;
  view.follow = null;
  settings.setInRoom(false);
  hud.setFriendLink(openFriends);
  roomCard.hide();
  history.replaceState(null, '', location.pathname + (roomParam(null) ? `?${roomParam(null)}` : ''));
  showReady();
}

/** The room changed (players, phase, connection): update the card and the messages. */
function roomChanged() {
  if (!session) return;
  const room = session.room;
  if (session.status === 'open' && room) {
    const me = room.players.find(p => p.id === session!.you);
    if (room.phase === 'racing' && me?.status === 'watching' && !watching && game.phase !== 'run' && !countdown.goAt) {
      // joined mid-round: watch it on its road
      watching = true;
      game = createGame(room.seed, 'over');
    }
    if (room.phase !== 'racing') watching = false;
    if (room.phase === 'results' && game.phase === 'over') hud.hideMessage(); // the card shows the scores
    if (room.phase === 'racing' && game.phase === 'over') showRoomSpectating();
    showWinner(room);
  }
  roomCard.render(session);
}

/** What's been shown for the round's winner: the big trophy (winner), the banner (everyone). */
let winShown = { round: 0, banner: false, big: false };

/**
 * The round has a winner: the winner gets the trophy once their run is over (in last
 * standing with "Stops", it's over the moment they win); everyone else gets a banner
 * while the round goes on, and the room card's title at the results.
 */
function showWinner(room: RoomView) {
  if (!room.winner || !session) return;
  if (winShown.round !== room.round) winShown = { round: room.round, banner: false, big: false };
  const winner = room.players.find(p => p.id === room.winner);
  if (!winner) return;
  if (winner.id === session.you) {
    if (game.phase === 'run') {
      if (room.win === 'last' && !room.drivesOn) {
        game.phase = 'over'; // won: this run is done
        roomRunEnded();
      } else if (!winShown.banner) {
        winShown.banner = true;
        hud.showBanner('Last one standing!', 'you win · keep going for score');
        const r = room.round;
        setTimeout(() => game.phase === 'run' && winShown.round === r && hud.hideMessage(), 2500);
        return;
      }
    }
    if (game.phase === 'over' && !winShown.big) {
      winShown.big = true;
      hud.hideMessage();
      win.show('You win!', room.win === 'last' ? 'last one standing' : `furthest · ${game.score}`);
      roomCard.holdFor(UI.winShowMs, session); // the results card would cover the trophy on a phone
    }
  } else if (room.phase === 'racing' && !winShown.banner && game.phase !== 'run') {
    winShown.banner = true;
    hud.showBanner(`${winner.name} wins!`, room.drivesOn ? 'last one standing · still driving' : 'last one standing');
  }
}

function roundStarting(round: number, seed: number, daily: boolean, inMs: number) {
  if (game.phase === 'run') game.phase = 'over'; // shouldn't happen; never drive two rounds at once
  watching = false;
  paused = false;
  input.clear();
  egg.hide();
  win.hide();
  // each player in their own lane, by room order: centred on the road, NET.startSpread apart
  const players = session?.room?.players ?? [];
  const lane = Math.max(0, players.findIndex(p => p.id === session?.you));
  const startX = (lane - (players.length - 1) / 2) * NET.startSpread;
  game = createGame(seed, 'ready', startX); // the road, on screen during the countdown
  countdown = { goAt: performance.now() + inMs, round, seed, daily, startX, shown: 0 };
  hideMenuCards();
  if (document.hidden) missStart(); // went away just as it started
}

/** Called every frame: count down, and start the round when it's time. */
function updateCountdown(now: number) {
  if (!countdown.goAt || !session) return;
  const left = countdown.goAt - now;
  if (left > 0) {
    const n = Math.ceil(left / 1000);
    if (n !== countdown.shown) hud.showCountdown((countdown.shown = n));
    return;
  }
  countdown.goAt = 0;
  ROOM_RULES.uncapped = !!session.room?.uncapped;
  // an Uncapped round can't be checked against the top speed, so it isn't ranked
  startRun(countdown.seed, !ROOM_RULES.uncapped, countdown.daily, countdown.startX);
  session.beginRun(countdown.round);
  session.sendPoses(recorder.log); // the starting pose, so the others see the car right away
}

function roomRunEnded() {
  const score = game.score;
  session!.crashed(recorder.steps, score);
  if (score > best) {
    best = score;
    storage.set(bestKey(), String(best));
  }
  showRoomSpectating();
  // ranked like a solo Normal run; without a name, the results card offers to save one
  if (player()) leaderboard.runEnded(ticket, score, () => {});
  else lastRoomRun = { ticket, score };
  debug?.event('crash (room)');
}

/** Watch the next rival still driving (in room order, wrapping round). */
function switchFollow() {
  const racing = view.rivals.filter(r => r.state === 'racing');
  if (racing.length < 2) return;
  const i = view.follow ? racing.indexOf(view.follow) : -1;
  view.follow = racing[(i + 1) % racing.length]; // updateFollow keeps it while they drive
  showRoomSpectating();
}

/** The player's own round is over (or they're watching one): say who's still driving. */
function showRoomSpectating() {
  const room = session?.room;
  if (room?.phase !== 'racing' || win.shown || (winShown.round === room.round && winShown.banner)) return; // the win says it all
  const name = view.follow?.name ?? null;
  const canSwitch = view.rivals.filter(r => r.state === 'racing').length > 1;
  if (watching) hud.showWatching(name, canSwitch);
  else hud.showSpectating(game.score, name, canSwitch);
}

function hideMenuCards() {
  install.hide();
  news.hide();
}

// A hidden tab doesn't run the game loop (no countdown, no driving), so in a room:
// mid-run it counts as a crash, in the countdown you sit the round out, and between
// rounds you're no longer ready (the round won't start without you).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !session) return;
  if (game.phase === 'run') {
    game.phase = 'over';
    runEnded();
  } else if (countdown.goAt) {
    missStart();
  } else if (session.room?.players.find(p => p.id === session!.you)?.ready) {
    session.setReady(false);
  }
});

/** Away when the round started: out of it on 0, watching the others when back. */
function missStart() {
  if (!session || !countdown.goAt) return;
  countdown.goAt = 0;
  session.beginRun(countdown.round);
  session.crashed(0, 0);
  game.phase = 'over';
  showRoomSpectating();
  debug?.event('missed the start (tab hidden)');
}

// debug timing (only with ?debug); reused object so measuring makes no garbage
const counters = { steps: 0, simMs: 0, drawMs: 0, trees: 0, cellsGenerated: 0, cellsEvicted: 0, skids: 0 };

startLoop({
  hz: SIM_HZ,
  maxFrameTime: MAX_FRAME_TIME,
  update(dt) {
    if (!debug) return tick(dt);
    const t0 = performance.now();
    tick(dt);
    counters.steps++;
    counters.simMs += performance.now() - t0;
  },
  render(alpha, now) {
    const t0 = debug ? performance.now() : 0;
    bot?.update(now);
    session?.update(now);
    updateCountdown(now);
    updateFollow();
    renderer.draw(game, paused ? 1 : alpha, now, view); // paused: no stepping, so draw the last state exactly
    hud.setScore(game.phase === 'ready' || watching || (settings.zen && !session) ? '' : String(game.score));
    if (!debug) return;
    counters.drawMs = performance.now() - t0;
    Object.assign(counters, renderer.stats);
    counters.skids = game.skids.marks.length;
    debug.frame(now, counters);
    counters.steps = 0;
    counters.simMs = 0;
  },
});

hud.setFriendLink(openFriends);
const linkedRoom = normalizeCode(new URLSearchParams(location.search).get('room') ?? '');
if (isRoomCode(linkedRoom)) {
  joinRoom(linkedRoom);
} else {
  showStart();
  menuCards();
}
// beforeinstallprompt usually arrives shortly after load, so check again then
addEventListener('load', () => setTimeout(() => game.phase === 'ready' && !session && !roomCard.shown && menuCards(), 1000));

// offline support (see src/sw.js); production only, the dev server's files change constantly
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
