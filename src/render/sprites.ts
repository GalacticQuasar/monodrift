// Pixel-art tree sprites (3/4 view: lumpy canopy over a short trunk), generated
// once at startup at art resolution and drawn scaled up with smoothing off.

import { COLORS, SCENERY } from '../config';
import { createRng, type Rng } from '../sim/rng';

export interface Sprite {
  canopy: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  /** Art pixels from the sprite's top-left corner to the canopy centre. */
  cx: number;
  cy: number;
  /** Size in art pixels. */
  w: number;
  h: number;
}

/** All tree sprites, indexed size * variantsPerSize + variant. */
export function buildTreeSprites(): Sprite[] {
  const rng = createRng(0x7ee5); // fixed: same art every load
  const sprites: Sprite[] = [];
  for (const R of SCENERY.treeSizes) {
    for (let v = 0; v < SCENERY.variantsPerSize; v++) sprites.push(makeTree(R, rng));
  }
  return sprites;
}

interface Lobe {
  x: number;
  y: number;
  r: number;
}

function makeTree(R: number, rng: Rng): Sprite {
  const pad = 2;
  const trunkH = Math.max(2, Math.round(R * 0.45)); // visible trunk below the canopy
  const trunkW = R >= 5 ? 2 : 1;
  const cx = R + pad, cy = R + pad;
  const baseY = cy + R + 1 + trunkH; // row just below the trunk's foot
  const w = 2 * R + 1 + 2 * pad;
  const h = baseY + 3;
  const mx = cx + 0.5, my = cy + 0.5; // canopy centre in continuous coords

  // canopy = a ring of round lobes plus one in the middle, layered back (top) to front (bottom)
  const lobes: Lobe[] = [];
  if (R <= 3) {
    lobes.push({ x: mx, y: my, r: R + 0.5 });
  } else {
    const n = R >= 6 ? 6 : R >= 5 ? 5 : 4;
    const ring = R * 0.42, lr = R * 0.58 + 0.3;
    const rot = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = rot + (i * Math.PI * 2) / n + (rng() - 0.5) * 0.4;
      const d = ring * (0.9 + rng() * 0.2);
      lobes.push({ x: mx + Math.cos(a) * d, y: my + Math.sin(a) * d, r: lr * (0.9 + rng() * 0.2) });
    }
    lobes.push({ x: mx + (rng() - 0.5), y: my + 0.1 * R, r: lr });
    lobes.sort((a, b) => a.y - b.y);
  }

  // rasterise lobes back to front; each pixel remembers its (frontmost) lobe and tone
  const owner = new Int8Array(w * h).fill(-1);
  const tone = new Int8Array(w * h);
  lobes.forEach((l, li) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x + 0.5 - l.x) / l.r, ny = (y + 0.5 - l.y) / l.r;
        if (nx * nx + ny * ny > 1) continue;
        // whole canopy is one ball lit from the top-left...
        const gx = (x + 0.5 - mx) / R, gy = (y + 0.5 - my) / R;
        const g = -(gx * 0.6 + gy * 0.8);
        let t = g > 0.3 ? 2 : g > -0.35 ? 1 : 0;
        // ...and lobes on the lit side get a small highlight cap
        if (lobes.length > 1 && g > -0.1 && -(nx * 0.6 + ny * 0.8) > 0.55) t = 3;
        owner[y * w + x] = li;
        tone[y * w + x] = t;
      }
    }
  });
  const ownerAt = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : owner[y * w + x]);

  const canopy = canvas(w, h), shadow = canvas(w, h);
  const cc = canopy.getContext('2d')!, sc = shadow.getContext('2d')!;
  const px = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };

  // ground shadow: a flat ellipse at the foot of the trunk
  const rx = R * 0.9, ry = Math.max(1.2, R * 0.35);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (((x - cx - 0.5) / rx) ** 2 + ((y - baseY + 0.5) / ry) ** 2 <= 1) px(sc, COLORS.treeShadow, x, y);
    }
  }

  // trunk (drawn first; the canopy covers its top)
  for (let y = cy + Math.round(R * 0.5); y < baseY; y++) {
    for (let i = 0; i < trunkW; i++) px(cc, COLORS.treeTrunk, cx + i, y);
  }

  // paint: silhouette outline, else the pixel's tone
  const tones = COLORS.treeTones;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ownerAt(x, y) < 0) continue;
      const silhouette = ownerAt(x + 1, y) < 0 || ownerAt(x - 1, y) < 0 || ownerAt(x, y + 1) < 0 || ownerAt(x, y - 1) < 0;
      px(cc, silhouette ? COLORS.treeOutline : tones[tone[y * w + x]], x, y);
    }
  }
  return { canopy, shadow, cx: cx + 0.5, cy: cy + 0.5, w, h };
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return el;
}
