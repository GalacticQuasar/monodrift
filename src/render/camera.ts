import { VIEW } from '../config';

/** Screen-space translation that keeps the car centred horizontally, low on screen. */
export function followCar(carX: number, carY: number, viewW: number, viewH: number) {
  return { x: viewW / 2 - carX, y: viewH * VIEW.carScreenY - carY };
}
