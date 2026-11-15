// Timeline geometry: summary windows (UTC) as minutes after landing, and the day ticks.

import { parseIsoMinute } from '../time'

export interface Bar {
  /** Minutes after landing, clipped to the mission. */
  start: number
  end: number
  /** The window's own UTC times, unclipped, for the tooltip. */
  startMs: number
  endMs: number
}

/** The windows that fall inside [landing, landing + days], in mission minutes. */
export function windowsToBars(spans: readonly (readonly [string, string])[], t0: string, days: number): Bar[] {
  const landing = parseIsoMinute(t0)
  if (landing === null) return []
  const total = days * 1440
  return spans.flatMap(([a, b]) => {
    const startMs = parseIsoMinute(a)
    const endMs = parseIsoMinute(b)
    if (startMs === null || endMs === null || endMs <= startMs) return []
    const start = Math.max(0, (startMs - landing) / 60_000)
    const end = Math.min(total, (endMs - landing) / 60_000)
    return end > start ? [{ start, end, startMs, endMs }] : []
  })
}

/** Total minutes covered by the bars. */
export function barMinutes(bars: readonly Bar[]): number {
  return bars.reduce((sum, b) => sum + (b.end - b.start), 0)
}

const STEPS = [1, 2, 5, 7, 10, 14, 15, 30, 60, 90]

/** Day ticks from 0 to the last whole day, at most about `max` of them. */
export function dayTicks(totalDays: number, max = 12): number[] {
  const step = STEPS.find((s) => totalDays / s <= max) ?? Math.ceil(totalDays / max)
  const ticks: number[] = []
  for (let d = 0; d <= totalDays + 1e-9; d += step) ticks.push(d)
  return ticks
}
