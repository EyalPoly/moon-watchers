// Reading the engine's series. No physics here: only lookups and comparisons of numbers
// the engine prepared (spec principle 1). Where the terrain is unknown the engine sends
// null; it stays null here and is never read as "hidden".

import type { Series } from '../api/types'
import { parseIsoMinute } from '../time'

type ListKey = Exclude<keyof Series, 'start' | 'step_s' | 'n' | 'power_w' | 'soc_pct'>

const LIST_KEYS: ListKey[] = [
  'sun_az', 'sun_el', 'sun_vis_el', 'sun_horizon_el', 'sun_lit_frac',
  'earth_az', 'earth_el', 'earth_vis_el', 'earth_horizon_el', 'earth_any', 'earth_whole', 'contact',
  'station_az', 'station_el', 'station_horizon_el', 'earth_station_up', 'station_moon_el',
]

/** Joins consecutive month series into one. */
export function stitchSeries(parts: Series[]): Series {
  if (parts.length === 1) return parts[0]
  const out: Series = { ...parts[0], n: 0, power_w: null, soc_pct: null }
  for (const key of LIST_KEYS) (out[key] as unknown[]) = parts.flatMap((p) => p[key] as unknown[])
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

/** A yes, a no, or null when the terrain behind the answer is unknown. */
export type Tri = boolean | null

export function sunVisible(s: Series, i: number): Tri {
  const fraction = s.sun_lit_frac[i]
  return fraction === null ? null : fraction > 0
}

export function contactAt(s: Series, i: number): Tri {
  const contact = s.contact[i]
  return contact === null ? null : contact === 1
}

export type Change =
  | { kind: 'at'; ms: number; inMs: number }
  | { kind: 'not-before'; ms: number }

/** The next step where `flag` changes (yes, no and unknown all count), searching to the end of the loaded series. */
export function nextChange(s: Series, i: number, flag: (s: Series, i: number) => Tri): Change {
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
  /** The skyline in that direction; null where the terrain is unknown. */
  horizon: number | null
  /** el − horizon at the body's center; null where the terrain is unknown. */
  clearance: number | null
  visible: Tri
  change: Change
}

export interface LiveStatus {
  sun: BodyStatus & { litFraction: number | null }
  earth: BodyStatus & { stationUp: boolean }
}

const clearance = (el: number, horizon: number | null) => (horizon === null ? null : el - horizon)

export function liveStatus(s: Series, i: number): LiveStatus {
  return {
    sun: {
      az: s.sun_az[i],
      el: s.sun_el[i],
      horizon: s.sun_horizon_el[i],
      clearance: clearance(s.sun_el[i], s.sun_horizon_el[i]),
      visible: sunVisible(s, i),
      litFraction: s.sun_lit_frac[i],
      change: nextChange(s, i, sunVisible),
    },
    // The Earth row is about the station: contact needs the station's direction to clear
    // the antenna's skyline, not the Earth's center.
    earth: {
      az: s.station_az[i],
      el: s.station_el[i],
      horizon: s.station_horizon_el[i],
      clearance: clearance(s.station_el[i], s.station_horizon_el[i]),
      visible: contactAt(s, i),
      stationUp: s.earth_station_up[i],
      change: nextChange(s, i, contactAt),
    },
  }
}
