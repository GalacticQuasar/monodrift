import './style.css';
import { MAX_FRAME_TIME, SIM_HZ } from './config';
import { createInput } from './input/input';
import { KEYS, storage } from './lib/storage';
import { startLoop } from './loop';
import { createRenderer } from './render/renderer';
import { createGame, step } from './sim/game';
import { createHud } from './ui/hud';
import { createSettings } from './ui/settings';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

const canvas = $<HTMLCanvasElement>('#c');
const renderer = createRenderer(canvas);
const hud = createHud($('#score'), $('#msg'));

let best = Number(storage.get(KEYS.best)) || 0;
let game = createGame(randomSeed());

const settings = createSettings($('#mode'), $('#crash'), changed => {
  if (changed !== 'mode') return;
  input.clear();
  if (game.phase === 'ready') hud.showStart(settings.mode);
});

const input = createInput(canvas, {
  mode: () => settings.mode,
  onAction: () => {
    if (game.phase === 'run') return false;
    game = createGame(randomSeed(), 'run');
    hud.hideMessage();
    return true;
  },
});

startLoop({
  hz: SIM_HZ,
  maxFrameTime: MAX_FRAME_TIME,
  update(dt) {
    if (step(game, input.intent(), dt, { crash: settings.crash }) !== 'crash') return;
    if (game.score > best) {
      best = game.score;
      storage.set(KEYS.best, String(best));
    }
    hud.showGameOver(game.score, best);
  },
  render(alpha) {
    renderer.draw(game, alpha);
    hud.setScore(game.phase === 'ready' ? '' : String(game.score));
  },
});

hud.showStart(settings.mode);
