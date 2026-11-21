// All gameplay tuning lives here.

/** Physics steps per second. Rendering runs at display rate and interpolates. */
export const SIM_HZ = 120;
/**
 * Longest frame (s) the sim catches up on. Anything longer just runs in slow motion
 * for that frame. Browsers/OSes occasionally drop a few frames (e.g. Windows DWM
 * hiccups) and catching up fully makes the car visibly jump; capping it turns the
 * jump into a brief pause. 35 ms still fully covers 30 fps devices (33.3 ms frames).
 */
export const MAX_FRAME_TIME = 0.035;

export const TRACK = {
  segmentLength: 20,
  /** Half the width of the road itself (the white part). */
  halfWidth: 62,
  /** Curb beyond each road edge: still drivable, the run ends past it. */
  curbWidth: 12,
  /** Max heading change per segment (rad) at the sharpest bend. */
  maxCurvature: 0.13,
  /** How fast curvature eases toward the current bend's target (per segment). */
  curvatureEase: 0.15,
  bendMinSegments: 8,
  bendExtraSegments: 22,
  firstBendAfter: 15,
  /** Road heading stays within this many radians of straight up. */
  headingLimit: 1.25,
  straightSegments: 14,
  startY: 200,
  initialPoints: 200,
  /** Keep at least this many points generated ahead of the car. */
  pointsAhead: 150,
  /** Track point the car starts at. */
  startIndex: 4,
  /** How far back the nearest-point search looks. */
  searchBehind: 6,
} as const;

/** Farthest the car may be from the centreline before it crashes: road plus curb. */
export const ROAD_EDGE = TRACK.halfWidth + TRACK.curbWidth;

export const CAR = {
  startY: 120,
  startVy: -200,
  startSpeed: 220,
  maxSpeed: 460,
  accel: 9,
  /** Heading change (rad/s) at full steer in rate mode. */
  steerRate: 3.1,
  /** How fast velocity aligns with heading. Lower = more slide. */
  grip: 2.2,
  /** Aim mode: how quickly heading swings toward the target... */
  aimEase: 14,
  /** ...capped at this rate (rad/s). */
  aimMaxRate: 7,
  length: 26,
  width: 14,
} as const;

export const SKIDS = {
  slipThreshold: 0.22,
  alphaPerSlip: 0.5,
  maxAlpha: 0.35,
  /** Darkness steps between 0 and maxAlpha. */
  levels: 7,
  /** Distance (px) between skid dots, so marks don't depend on frame rate. */
  spacing: 4,
  /** Rear wheels: this far behind the car's centre... */
  wheelBack: 9,
  /**
   * ...and this far to each side. Inside the body (half width CAR.width / 2 = 7) so the
   * 3 px marks stay under the car; at 7 they straddled its edge and looked too wide.
   */
  wheelSide: 5,
  max: 1600,
  trim: 200,
} as const;

export const SCORE = {
  /** World px of progress per point. */
  pxPerPoint: 50,
  /**
   * Leaderboard check: road progress per px the car drives, at most. Cutting the
   * inside of bends lets progress outpace driving (the tightest bend's inside edge
   * is ~1.7x shorter than the centreline), but bends alternate: a corner-cutting
   * autopilot averages under 1.0 (tests/leaderboard-rules.test.ts). Scores above
   * what this allows for the measured time are rejected.
   */
  maxProgressPerPx: 1.4,
} as const;

export const UI = {
  /** After a crash, taps are ignored this long so a held/frantic tap can't skip the score. */
  retryDelayMs: 500,
  /** The same, after the copper key easter egg, so its animation isn't tapped away. */
  eggRetryDelayMs: 1500,
  /** A still mouse cursor hides after this long (it also hides on key press or while steering). */
  cursorHideMs: 1500,
  /** Easter egg: this many taps on the Vik green swatch within vikWindowMs... */
  vikTaps: 10,
  vikWindowMs: 3000,
  /** Rooms: the winner's trophy has the screen to itself this long before the results card comes up. */
  winShowMs: 3000,
  /** Phones get the "add to home screen" card on a menu screen from this many runs on. */
  installPromptAfterRuns: 3,
} as const;

/**
 * Speed setting: game-speed multiplier (the sim runs this much faster/slower, so the
 * car's lines through bends stay the same). Only Normal runs go on the leaderboard.
 */
export const SPEED = {
  slow: 0.8,
  normal: 1,
  fast: 1.25,
} as const;

export const INPUT = {
  /** Slide mode: px of finger travel = 90° of heading change. */
  dragPxPer90: 120,
  /**
   * Steering multiplier per sensitivity level (Settings), applied to the keyboard/Sides
   * turn rate and the Slide drag distance. The middle level is the default.
   */
  sensitivity: [0.7, 0.85, 1, 1.15, 1.3],
} as const;

/** Other cars on the road (multiplayer rivals; later, ghosts). */
export const NET = {
  /** A pose sample is taken (and sent) every this many sim steps: 120 Hz / 8 = 15 a second. */
  sampleEvery: 8,
  /** Live rivals play back this far behind the newest sample, to ride out network jitter. */
  bufferMs: 120,
  /** When samples are late, keep a rival moving this long before it stops. */
  maxExtrapolateMs: 250,
  /** How fast the playback delay grows back after a fast arrival (ms per ms). */
  offsetCreep: 0.02,
  /** In a room, cars start this far apart sideways (px), centred on the road, so they don't overlap. */
  startSpread: 30,
  /** Off-screen arrow: distance from the screen edge (px). */
  arrowInset: 22,
  /** Debug bot (?debug&bot): fake network delay and its random spread (ms). */
  botLatencyMs: 80,
  botJitterMs: 50,
} as const;

export const VIEW = {
  /** Car's vertical position on screen (fraction of height). */
  carScreenY: 0.66,
  drawBehind: 40,
  drawAhead: 140,
  maxDpr: 2,
} as const;

/** Decorative trees around the road (render-only; no effect on gameplay). */
export const SCENERY = {
  /** Trees are generated per square world cell of this size (px). */
  cellSize: 160,
  maxClumpsPerCell: 2,
  maxClumpSize: 5,
  /** Max distance (px) of a tree from its clump's centre. */
  clumpSpread: 70,
  /**
   * Trees in a cell keep their canopies at least this many canopy radii apart
   * (1 = just touching), so groups read as separate trees rather than one blob.
   */
  treeSpacing: 1.15,
  /** Spots tried for a tree before it's dropped for being too close to others. */
  placementTries: 4,
  /** Size of forest/clearing patches, in cells. */
  patchCells: 4,
  /** Density below this is a clearing. */
  clearing: 0.3,
  /** Canopy radii in art pixels, small to large. */
  treeSizes: [3, 4, 5, 6, 7],
  /** Distinct sprite shapes generated per size. */
  variantsPerSize: 3,
  /** Screen px per art pixel. */
  pixelScale: 3,
  /** Gap kept between a canopy and the road edge (px). */
  roadMargin: 10,
  /** Road points behind the car checked when placing trees. */
  checkBehind: 150,
  /** Drop cached cells once the cache holds this many. */
  maxCachedCells: 800,
} as const;

/** Campfires (src/art/campfire-*.json): in small clearings in the forest, beside the road. Render-only. */
export const CAMPFIRE = {
  /** Only in a forest cell (tree density 0..1 at least this) with at least... */
  forestDensity: 0.3,
  /** ...this many of its 8 neighbour cells as dense, so it's surrounded by trees. */
  minForestNeighbours: 6,
  /** Trees keep their canopies this far (px) from a campfire: its clearing. */
  clearingRadius: 40,
  /** Trees planted around the clearing (fewer where the road is in the way). */
  ringTrees: 9,
  /** Chance such a cell gets one, if it has a spot near the road (~1 per 4000 px of road). */
  chance: 0.05,
  /** Extra distance (px) a campfire keeps from the road, beyond the usual margin trees keep... */
  roadMinGap: 45,
  /** ...and how much further out than that it may sit (px). */
  roadGap: 80,
  /** Spots tried per cell. */
  tries: 6,
  /** Animation: each frame of the flames lasts this long. */
  frameMs: 160,
  /** Dark mode glow: radius in art px, and the number of flat light bands. */
  glowRadius: 20,
  glowBands: 3,
} as const;

/**
 * Car colours (Settings > Car; in rooms, others see yours). The car is the one exception
 * to the grayscale art, kept muted. Each has a light-mode value (on the white road:
 * mid-dark) and a dark-mode value (on the night road: light, pastel). 'default' isn't
 * listed: it's the palette's `car` (and rivals who keep it are drawn in `rivalCar`).
 */
export const CAR_COLORS = [
  { id: 'red', name: 'Red', light: '#b0544c', dark: '#e2a39c' },
  { id: 'mustard', name: 'Mustard', light: '#a3862c', dark: '#ddc98a' },
  { id: 'green', name: 'Green', light: '#5c8752', dark: '#a7cd9a' },
  // a friend's pick: deep green, the same by day and at night (on purpose, though it's dark on the night road)
  { id: 'vik', name: 'Vik green', light: '#06402B', dark: '#06402B' },
  { id: 'teal', name: 'Teal', light: '#3e827d', dark: '#95ccc7' },
  { id: 'blue', name: 'Blue', light: '#4e6ea6', dark: '#a0b7e2' },
  { id: 'purple', name: 'Purple', light: '#7a5a9c', dark: '#c4a9de' },
  { id: 'pink', name: 'Pink', light: '#ad5a84', dark: '#e5a8c6' },
] as const;

export type CarColor = (typeof CAR_COLORS)[number]['id'] | 'default';

/** The colour value for car colour `id` in `theme`, or null for the default / unknown. */
export function carColorValue(id: string | null | undefined, theme: 'light' | 'dark'): string | null {
  for (const c of CAR_COLORS) if (c.id === id) return c[theme];
  return null;
}

export interface Palette {
  readonly theme: 'light' | 'dark';
  readonly ground: string;
  readonly road: string;
  /** Curb: the drivable band along each road edge. */
  readonly curb: string;
  readonly car: string;
  readonly windshield: string;
  /** Other players' cars, their windshield, and their name labels / off-screen arrows. */
  readonly rivalCar: string;
  readonly rivalWindshield: string;
  readonly rivalLabel: string;
  readonly skid: string;
  /** Multiplies SKIDS.maxAlpha (marks need more strength on a dark road). */
  readonly skidStrength: number;
  readonly treeShadow: string;
  /** Pixel-art tree tones: outline, trunk, then canopy shades dark → light. */
  readonly treeOutline: string;
  readonly treeTrunk: string;
  readonly treeTones: readonly [string, string, string, string];
  /** Campfire flames: outer, core. */
  readonly flame: string;
  readonly flameCore: string;
  /** Campfire light on the ground, one band's worth (bands stack); '' for none. */
  readonly glow: string;
}

/** Canvas colours per theme (the DOM UI's colours are CSS tokens in style.css). */
export const COLORS: { readonly light: Palette; readonly dark: Palette } = {
  light: {
    theme: 'light',
    ground: '#e8e8e8',
    road: '#fff',
    curb: '#c4c4c4',
    car: '#111',
    windshield: '#e8e8e8',
    rivalCar: '#7d7d7d',
    rivalWindshield: '#e8e8e8',
    rivalLabel: '#555',
    skid: '#000',
    skidStrength: 1,
    treeShadow: 'rgba(0,0,0,0.1)',
    treeOutline: '#4d4d4d',
    treeTrunk: '#5e5e5e',
    treeTones: ['#7a7a7a', '#939393', '#acacac', '#c6c6c6'],
    flame: '#dcdcdc',
    flameCore: '#fff',
    glow: '', // daylight: fires don't light the ground
  },
  // dark: night road; the car is the lightest thing on screen instead of the darkest
  dark: {
    theme: 'dark',
    ground: '#1b1b1b',
    road: '#383838',
    curb: '#505050',
    car: '#f0f0f0',
    windshield: '#1b1b1b',
    rivalCar: '#9a9a9a',
    rivalWindshield: '#1b1b1b',
    rivalLabel: '#aaa',
    skid: '#000',
    skidStrength: 2,
    treeShadow: 'rgba(0,0,0,0.35)',
    treeOutline: '#0f0f0f',
    treeTrunk: '#2a2a2a',
    treeTones: ['#2e2e2e', '#3a3a3a', '#474747', '#565656'],
    // fire is a light source: brighter than the rest of the night scenery (the car stays brightest)
    flame: '#8c8c8c',
    flameCore: '#d4d4d4',
    glow: 'rgba(255,255,255,0.05)',
  },
};
