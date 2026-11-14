// Reading the engine's series. No physics here: only lookups and comparisons of numbers
// the engine prepared (spec principle 1).

import type { Series } from '../api/types'
import { parseIsoMinute } from '../time'

type ArrayKey = {
  [K in keyof Series]: Series[K] extends (number | boolean)[] ? K : never
}[keyof Series]

const ARRAY_KEYS: ArrayKey[] = [
  'sun_az', 'sun_el', 'sun_vis_el', 'sun_horizon_el', 'sun_lit_frac',
  'earth_az', 'earth_el', 'earth_vis_el', 'earth_horizon_el', 'earth_visible', 'earth_station_up',
]

/** Joins consecutive month series into one. */
export function stitchSeries(parts: Series[]): Series {
  if (parts.length === 1) return parts[0]
  const out: Series = { ...parts[0], n: 0, power_w: null, soc_pct: null }
  for (const key of ARRAY_KEYS) (out[key] as unknown[]) = parts.flatMap((p) => p[key] as unknown[])
  out.n = parts.reduce((sum, p) => sum + p.n, 0)
  return out
}

export function seriesStartMs(s: Series): number {
  return parseIsoMinute(s.start) ?? Date.parse(s.start)
}

export function seriesTimeAt(s: Series, i: number): number {
  return seriesStartMs(s) + i * s.step_s * 1000
}

/** Index of the step at `ms`, or null outside the series. */
export function indexAt(s: Series, ms: number): number | null {
  const i = Math.round((ms - seriesStartMs(s)) / (s.step_s * 1000))
  return i >= 0 && i < s.n ? i : null
}

export const sunVisible = (s: Series, i: number) => s.sun_lit_frac[i] > 0
export const earthVisible = (s: Series, i: number) => s.earth_visible[i]

export type Change =
  | { kind: 'at'; ms: number; inMs: number }
  | { kind: 'not-before'; ms: number }

/** The next step where `flag` flips, searching to the end of the loaded series. */
export function nextChange(s: Series, i: number, flag: (s: Series, i: number) => boolean): Change {
  const now = flag(s, i)
  for (let j = i + 1; j < s.n; j++) {
    if (flag(s, j) !== now) {
      const ms = seriesTimeAt(s, j)
      return { kind: 'at', ms, inMs: ms - seriesTimeAt(s, i) }
    }
  }
  return { kind: 'not-before', ms: seriesTimeAt(s, s.n) }
}

export interface BodyStatus {
  az: number
  el: number
  horizon: number
  /** el − horizon at the body's center. */
  clearance: number
  visible: boolean
  change: Change
}

export interface LiveStatus {
  sun: BodyStatus & { litFraction: number }
  earth: BodyStatus & { stationUp: boolean }
}

export function liveStatus(s: Series, i: number): LiveStatus {
  return {
    sun: {
      az: s.sun_az[i],
      el: s.sun_el[i],
      horizon: s.sun_horizon_el[i],
      clearance: s.sun_el[i] - s.sun_horizon_el[i],
      visible: sunVisible(s, i),
      litFraction: s.sun_lit_frac[i],
      change: nextChange(s, i, sunVisible),
    },
    earth: {
      az: s.earth_az[i],
      el: s.earth_el[i],
      horizon: s.earth_horizon_el[i],
      clearance: s.earth_el[i] - s.earth_horizon_el[i],
      visible: earthVisible(s, i),
      stationUp: s.earth_station_up[i],
      change: nextChange(s, i, earthVisible),
    },
  }
}
