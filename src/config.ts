// All gameplay tuning lives here. Values match the original prototype.

/** Physics steps per second. Rendering runs at display rate and interpolates. */
export const SIM_HZ = 120;
/** Longest frame (s) the loop will catch up on, e.g. after a tab switch. */
export const MAX_FRAME_TIME = 0.1;

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
} as const;

export const INPUT = {
  /** Slide mode: px of finger travel = 90° of heading change. */
  dragPxPer90: 120,
} as const;

export const VIEW = {
  /** Car's vertical position on screen (fraction of height). */
  carScreenY: 0.66,
  drawBehind: 40,
  drawAhead: 140,
  maxDpr: 2,
} as const;

export const COLORS = {
  ground: '#e8e8e8',
  road: '#fff',
  car: '#111',
  windshield: '#e8e8e8',
  skid: '0,0,0',
} as const;
