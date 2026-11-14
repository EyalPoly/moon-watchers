export const HEIGHT_RANGE = { min: 1, max: 10 }

/**
 * Nearest centimetre. The small offset keeps 2.555 (stored as 2.55499…) rounding to 2.56
 * instead of to 2.55, so a typed height and the one the server sees agree.
 */
export function roundCm(value: number): number {
  return Math.round(value * 100 + 1e-7) / 100
}
