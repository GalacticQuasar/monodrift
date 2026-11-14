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
  halfWidth: 62,
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

export const CAR = {
  startY: 120,
  startVy: -200,
  startSpeed: 220,
  maxSpeed: 460,
  accel: 9,
  /** Heading change (rad/s) at full steer in rate mode. */
  steerRate: 3.1,
  /** How fast velocity aligns with heading. Lower = more slide. */
  grip: 2.4,
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
  wheelBack: 9,
  wheelSide: 7,
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
  /** A still mouse cursor hides after this long (it also hides on key press or while steering). */
  cursorHideMs: 1500,
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

export interface Palette {
  readonly ground: string;
  readonly road: string;
  readonly car: string;
  readonly windshield: string;
  readonly skid: string;
  /** Multiplies SKIDS.maxAlpha (marks need more strength on a dark road). */
  readonly skidStrength: number;
  readonly treeShadow: string;
  /** Pixel-art tree tones: outline, trunk, then canopy shades dark → light. */
  readonly treeOutline: string;
  readonly treeTrunk: string;
  readonly treeTones: readonly [string, string, string, string];
}

/** Canvas colours per theme (the DOM UI's colours are CSS tokens in style.css). */
export const COLORS: { readonly light: Palette; readonly dark: Palette } = {
  light: {
    ground: '#e8e8e8',
    road: '#fff',
    car: '#111',
    windshield: '#e8e8e8',
    skid: '#000',
    skidStrength: 1,
    treeShadow: 'rgba(0,0,0,0.1)',
    treeOutline: '#4d4d4d',
    treeTrunk: '#5e5e5e',
    treeTones: ['#7a7a7a', '#939393', '#acacac', '#c6c6c6'],
  },
  // dark: night road; the car is the lightest thing on screen instead of the darkest
  dark: {
    ground: '#1b1b1b',
    road: '#383838',
    car: '#f0f0f0',
    windshield: '#1b1b1b',
    skid: '#000',
    skidStrength: 2,
    treeShadow: 'rgba(0,0,0,0.35)',
    treeOutline: '#0f0f0f',
    treeTrunk: '#2a2a2a',
    treeTones: ['#2e2e2e', '#3a3a3a', '#474747', '#565656'],
  },
};
