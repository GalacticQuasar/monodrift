import './style.css';
import { COLORS, MAX_FRAME_TIME, SIM_HZ, SPEED, UI } from './config';
import { createInput } from './input/input';
import { DESKTOP } from './lib/device';
import { KEYS, storage } from './lib/storage';
import { startLoop } from './loop';
import { ALL_LAYERS, createRenderer } from './render/renderer';
import { api } from './lib/api';
import { dailySeed, utcDay } from './sim/daily';
import { createGame, step } from './sim/game';
import { autoHideCursor } from './ui/cursor';
import { createDebug, debugLayers } from './ui/debug';
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
const debug = createDebug();
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

/** Local best is kept per speed, so Slow runs don't set the Normal best. */
const bestKey = () => (settings.speed === 'normal' ? KEYS.best : `${KEYS.best}-${settings.speed}`);
const loadBest = () => Number(storage.get(bestKey())) || 0;
/** performance.now() before which a tap won't start a new run. */
let retryAllowedAt = 0;
/** Run frozen because Settings was opened mid-run; the next tap/key after it closes resumes. */
let paused = false;
/** Leaderboard ticket for the current run (null: zen, not Normal speed, or offline when it started). */
let ticket: Promise<string | null> = Promise.resolve(null);

function showReady() {
  paused = false;
  input.clear();
  game = createGame(roadSeed());
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
  }
}, open => {
  if (open && game.phase === 'run') {
    paused = true;
    input.clear();
    debug?.event('pause');
  } else if (!open && paused) {
    hud.showPaused(); // resuming the moment the panel closes would crash the car before you're ready
  }
});

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
    if (performance.now() < retryAllowedAt) return true; // swallow the tap
    // from the start screen, drive the road already on screen; a retry gets a new one
    game = createGame(game.phase === 'ready' ? game.seed : roadSeed(), 'run');
    // the server times the run from here, which caps the score it will accept
    best = loadBest();
    ticket = settings.zen || settings.speed !== 'normal' ? Promise.resolve(null) : api.ticket(game.seed, settings.daily).catch(() => null);
    hud.hideMessage();
    install.runStarted();
    news.hide();
    leaderboard.runStarted();
    debug?.event('start');
    return true;
  },
});

function tick(dt: number) {
  if (paused) return;
  if (step(game, input.intent(), dt, { crash: !settings.zen, speed: SPEED[settings.speed] }) !== 'crash') return;
  retryAllowedAt = performance.now() + UI.retryDelayMs;
  const newBest = game.score > best;
  if (newBest) {
    best = game.score;
    storage.set(bestKey(), String(best));
  }
  hud.showGameOver(game.score, best, UI.retryDelayMs);
  menuCards();
  const ended = game;
  leaderboard.runEnded(ticket, game.score, text => {
    if (game === ended) hud.showRank(text); // still on this run's game-over screen
  });
  if (debug) {
    debug.event(newBest ? 'crash (new best saved)' : 'crash');
    setTimeout(() => debug.event('retry hint fades in'), UI.retryDelayMs);
  }
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
    renderer.draw(game, paused ? 1 : alpha); // paused: no stepping, so draw the last state exactly
    hud.setScore(game.phase === 'ready' || settings.zen ? '' : String(game.score));
    if (!debug) return;
    counters.drawMs = performance.now() - t0;
    Object.assign(counters, renderer.stats);
    counters.skids = game.skids.marks.length;
    debug.frame(now, counters);
    counters.steps = 0;
    counters.simMs = 0;
  },
});

showStart();
menuCards();
// beforeinstallprompt usually arrives shortly after load, so check again then
addEventListener('load', () => setTimeout(() => game.phase === 'ready' && menuCards(), 1000));

// offline support (see src/sw.js); production only, the dev server's files change constantly
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
