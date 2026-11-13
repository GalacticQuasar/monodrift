import { describe, expect, it } from 'vitest';
import { CAR } from '../src/config';
import { createCar, slipOf, updateCar } from '../src/sim/car';

const DT = 1 / 120;

describe('car', () => {
  it('turns at steerRate in rate mode', () => {
    const car = createCar();
    const h0 = car.h;
    updateCar(car, { rate: 1 }, DT);
    expect(car.h - h0).toBeCloseTo(CAR.steerRate * DT, 10);
  });

  it('caps the turn rate in aim mode', () => {
    const car = createCar();
    const h0 = car.h;
    updateCar(car, { target: h0 + Math.PI }, DT);
    expect(car.h - h0).toBeCloseTo(CAR.aimMaxRate * DT, 10);
  });

  it('accelerates up to maxSpeed', () => {
    const car = createCar();
    for (let i = 0; i < 120 * 120; i++) updateCar(car, { rate: 0 }, DT);
    expect(car.speed).toBe(CAR.maxSpeed);
  });

  it('slides after a sharp turn, then grips back', () => {
    const car = createCar();
    for (let i = 0; i < 60; i++) updateCar(car, { rate: 1 }, DT);
    expect(slipOf(car)).toBeGreaterThan(0.22);
    for (let i = 0; i < 600; i++) updateCar(car, { rate: 0 }, DT);
    expect(slipOf(car)).toBeLessThan(0.01);
  });
});
