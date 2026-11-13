import './style.css';
import { MAX_FRAME_TIME, SIM_HZ, UI } from './config';
import { createInput } from './input/input';
import { KEYS, storage } from './lib/storage';
import { startLoop } from './loop';
import { createRenderer } from './render/renderer';
import { createGame, step } from './sim/game';
import { createFpsMeter } from './ui/fps';
import { createHud } from './ui/hud';
import { createSettings } from './ui/settings';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

const canvas = $<HTMLCanvasElement>('#c');
const renderer = createRenderer(canvas);
const hud = createHud($('#score'), $('#msg'));
const fps = createFpsMeter();

let best = Number(storage.get(KEYS.best)) || 0;
let game = createGame(randomSeed());
/** performance.now() before which a tap won't start a new run. */
let retryAllowedAt = 0;

function showReady() {
  input.clear();
  game = createGame(randomSeed());
  hud.showStart(settings.mode, settings.zen);
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
    game = createGame(randomSeed(), 'run');
    hud.hideMessage();
    return true;
  },
});

startLoop({
  hz: SIM_HZ,
  maxFrameTime: MAX_FRAME_TIME,
  update(dt) {
    if (step(game, input.intent(), dt, { crash: !settings.zen }) !== 'crash') return;
    retryAllowedAt = performance.now() + UI.retryDelayMs;
    if (game.score > best) {
      best = game.score;
      storage.set(KEYS.best, String(best));
    }
    hud.showGameOver(game.score, best, UI.retryDelayMs);
  },
  render(alpha) {
    fps?.frame(performance.now());
    renderer.draw(game, alpha);
    hud.setScore(game.phase === 'ready' || settings.zen ? '' : String(game.score));
  },
});

hud.showStart(settings.mode, settings.zen);
