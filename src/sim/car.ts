import { CAR } from '../config';

export interface Car {
  x: number;
  y: number;
  /** Heading the car points in (rad). Velocity lags behind it, which is the drift. */
  h: number;
  vx: number;
  vy: number;
  speed: number;
  /** Pose before the latest step, for render interpolation. */
  prevX: number;
  prevY: number;
  prevH: number;
}

/** Either turn at a rate (-1..1), or swing toward an absolute heading. */
export type Steer = { rate: number } | { target: number };

export function createCar(): Car {
  const h = -Math.PI / 2;
  return {
    x: 0,
    y: CAR.startY,
    h,
    vx: 0,
    vy: CAR.startVy,
    speed: CAR.startSpeed,
    prevX: 0,
    prevY: CAR.startY,
    prevH: h,
  };
}

export function updateCar(car: Car, steer: Steer, dt: number): void {
  car.prevX = car.x;
  car.prevY = car.y;
  car.prevH = car.h;

  car.speed = Math.min(CAR.maxSpeed, car.speed + CAR.accel * dt);

  if ('target' in steer) {
    // swing toward the aimed heading quickly, but capped so it still feels like a car
    const step = (steer.target - car.h) * (1 - Math.exp(-CAR.aimEase * dt));
    const cap = CAR.aimMaxRate * dt;
    car.h += Math.max(-cap, Math.min(cap, step));
  } else {
    car.h += steer.rate * CAR.steerRate * dt;
  }

  // velocity eases toward the heading direction; the lag is the slide
  const k = 1 - Math.exp(-CAR.grip * dt);
  car.vx += (Math.cos(car.h) * car.speed - car.vx) * k;
  car.vy += (Math.sin(car.h) * car.speed - car.vy) * k;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
}

/** 0 = rolling straight, 1 = fully sideways. */
export function slipOf(car: Car): number {
  const v = Math.hypot(car.vx, car.vy) || 1;
  return Math.abs((car.vx * Math.sin(car.h) - car.vy * Math.cos(car.h)) / v);
}
