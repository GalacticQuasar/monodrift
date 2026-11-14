import './style.css';
import { MAX_FRAME_TIME, SIM_HZ, UI } from './config';
import { createInput } from './input/input';
import { KEYS, storage } from './lib/storage';
import { startLoop } from './loop';
import { createRenderer } from './render/renderer';
import { createGame, step } from './sim/game';
import { autoHideCursor } from './ui/cursor';
import { createDebug, debugLayers } from './ui/debug';
import { createHud } from './ui/hud';
import { createInstallPrompt } from './ui/install';
import { createSettings } from './ui/settings';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

const canvas = $<HTMLCanvasElement>('#c');
const renderer = createRenderer(canvas, debugLayers());
const hud = createHud($('#score'), $('#msg'));
const debug = createDebug();
autoHideCursor();
const install = createInstallPrompt($('#install'));

let best = Number(storage.get(KEYS.best)) || 0;
let game = createGame(randomSeed());
/** performance.now() before which a tap won't start a new run. */
let retryAllowedAt = 0;

function showReady() {
  input.clear();
  game = createGame(randomSeed());
  hud.showStart(settings.mode, settings.zen);
  install.maybeShow();
}

const settings = createSettings($('#mode'), $('#zen'), changed => {
  if (changed === 'zen') {
    // switching zen ends the current run: no carrying a zen run into a scored one,
    // and it's the way out of a zen run (which never ends on its own)
    showReady();
  } else {
    input.clear();
    if (game.phase === 'ready') hud.showStart(settings.mode, settings.zen);
  }
});

const input = createInput(canvas, {
  mode: () => settings.mode,
  onAction: () => {
    if (game.phase === 'run') return false;
    if (performance.now() < retryAllowedAt) return true; // swallow the tap
    // from the start screen, drive the road already on screen; a retry gets a new one
    game = createGame(game.phase === 'ready' ? game.seed : randomSeed(), 'run');
    hud.hideMessage();
    install.runStarted();
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

hud.showStart(settings.mode, settings.zen);
// beforeinstallprompt usually arrives shortly after load, so check again then
addEventListener('load', () => setTimeout(() => game.phase === 'ready' && install.maybeShow(), 1000));

// offline support (see src/sw.js); production only, the dev server's files change constantly
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
