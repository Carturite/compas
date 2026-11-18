/**
 * Perspective for scenes: maps the flat board (u, v in 0..1) onto the ground of a picture,
 * given where the four corners of the ground are. Works for one or two vanishing points alike,
 * because the vanishing points follow from the corners. Pure math, no browser APIs.
 */

export type Point = readonly [x: number, y: number];

/** Corners of the ground in picture coordinates: back-left, back-right, front-right, front-left. */
export type Quad = readonly [Point, Point, Point, Point];

/** 3 × 3 projective matrix, row by row; the last entry is always 1. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

/** The projective map that sends the unit square's corners (0,0) (1,0) (1,1) (0,1) to the quad. */
export function squareToQuad(q: Quad): Homography {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    // A parallelogram: no foreshortening needed.
    return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
  }
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

export function apply(m: Homography, u: number, v: number): Point {
  const w = m[6] * u + m[7] * v + m[8];
  return [(m[0] * u + m[1] * v + m[2]) / w, (m[3] * u + m[4] * v + m[5]) / w];
}

/** The inverse map, from the picture back to the flat board. */
export function invert(m: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  return [A / I, B / I, C / I, D / I, E / I, F / I, G / I, H / I, 1];
}
