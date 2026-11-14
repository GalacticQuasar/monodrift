import './style.css';
import { MAX_FRAME_TIME, SIM_HZ, UI } from './config';
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
import { createSettings, sensitivityFactor } from './ui/settings';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

const canvas = $<HTMLCanvasElement>('#c');
// layers drawn; the Trees setting adds/removes 'trees' unless ?render=… chose them
const fixedLayers = debugLayers();
const layers = fixedLayers ?? new Set(ALL_LAYERS);
const renderer = createRenderer(canvas, layers);
const hud = createHud($('#score'), $('#msg'));
const debug = createDebug();
autoHideCursor();
const install = createInstallPrompt($('#install'));
const leaderboard = createLeaderboard({
  button: $('#lb'),
  panel: $('#board'),
  card: $('#join'),
  onCardShown: () => install.hide(),
});

let best = Number(storage.get(KEYS.best)) || 0;
/** performance.now() before which a tap won't start a new run. */
let retryAllowedAt = 0;
/** Leaderboard ticket for the current run (null: zen, or offline when it started). */
let ticket: Promise<string | null> = Promise.resolve(null);

function showReady() {
  input.clear();
  game = createGame(roadSeed());
  hud.showStart(settings.mode, settings.zen, settings.daily);
  install.maybeShow();
}

const settings = createSettings($('#settings-btn'), $('#settings'), changed => {
  if (changed === 'zen' || changed === 'daily') {
    // ends the current run: no carrying a zen run into a scored one (zen runs never
    // end on their own, so this is the way out), and a new road needs a new run
    showReady();
  } else if (changed === 'mode') {
    input.clear();
    if (game.phase === 'ready') hud.showStart(settings.mode, settings.zen, settings.daily);
  } else if (changed === 'trees') {
    applyTrees();
  }
});

function applyTrees() {
  if (fixedLayers) return;
  if (settings.trees) layers.add('trees');
  else layers.delete('trees');
}
applyTrees();

/** Today's road (same for everyone, by UTC day) or a random one. */
const roadSeed = () => (settings.daily ? dailySeed(utcDay(Date.now())) : randomSeed());
let game = createGame(roadSeed());

const input = createInput(canvas, {
  mode: () => settings.mode,
  sensitivity: () => sensitivityFactor(settings.sensitivity),
  pointerSteer: !DESKTOP,
  onAction: () => {
    if (game.phase === 'run' || leaderboard.open || settings.open) return false;
    if (performance.now() < retryAllowedAt) return true; // swallow the tap
    // from the start screen, drive the road already on screen; a retry gets a new one
    game = createGame(game.phase === 'ready' ? game.seed : roadSeed(), 'run');
    // the server times the run from here, which caps the score it will accept
    ticket = settings.zen ? Promise.resolve(null) : api.ticket(game.seed, settings.daily).catch(() => null);
    hud.hideMessage();
    install.runStarted();
    leaderboard.runStarted();
    debug?.event('start');
    return true;
  },
});

function tick(dt: number) {
  if (step(game, input.intent(), dt, { crash: !settings.zen }) !== 'crash') return;
  retryAllowedAt = performance.now() + UI.retryDelayMs;
  const newBest = game.score > best;
  if (newBest) {
    best = game.score;
    storage.set(KEYS.best, String(best));
  }
  hud.showGameOver(game.score, best, UI.retryDelayMs);
  install.maybeShow();
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
    renderer.draw(game, alpha);
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

hud.showStart(settings.mode, settings.zen, settings.daily);
// beforeinstallprompt usually arrives shortly after load, so check again then
addEventListener('load', () => setTimeout(() => game.phase === 'ready' && install.maybeShow(), 1000));

// offline support (see src/sw.js); production only, the dev server's files change constantly
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
