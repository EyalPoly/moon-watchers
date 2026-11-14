// Ticket ranking: takes each ticket's location and mission settings and returns the
// tickets graded and sorted, best first.
//
// DUMMY. The real ranking function does not exist yet. This one has the same inputs and
// outputs, so swapping it for the real call (most likely a server endpoint) changes only
// this file. Its grades are made up from simple rules of thumb plus a small drift over
// time, so the screen shows the ranking refreshing on its own.

import type { Station } from './types'

export interface RankInput {
  /** Caller's id for the ticket; returned unchanged. */
  key: string
  site: { id: string; lat_deg: number; lon_deg: number; elevation_m: number; slope_deg: number }
  t0: string
  days: number
  mast: number
  station: Station
  station_lat: number | null
  station_lon: number | null
}

export interface RankedTicket {
  key: string
  /** 1 is the best. */
  rank: number
  /** 0–100, higher is better. */
  grade: number
}

/** How often the ranking refreshes by itself. */
export const RANK_REFRESH_MS = 15_000

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v))

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return (h >>> 0) / 0xffffffff
}

function dummyGrade(t: RankInput, now: number): number {
  const dayOfYear = (Date.parse(t.t0) / 86_400_000) % 365.25
  let g = 50
  g += clamp(-15, 25, t.site.elevation_m / 60) // high ground sees past the terrain
  g -= t.site.slope_deg * 2.5 // steep ground is harder to land on
  g += (Math.abs(t.site.lat_deg) - 84) * 2 // closer to the pole, longer days
  g += 8 * Math.sin((2 * Math.PI * dayOfYear) / 365.25) // season
  g += (t.mast - 2) * 0.8 // a taller mast clears more
  g -= Math.min(10, t.days / 36) // longer missions are harder
  g += t.station === 'any' ? 4 : 0 // three stations beat one
  // Drift: stands in for inputs that change while the user works.
  g += 1.5 * Math.sin(now / 45_000 + hash(t.key + t.site.id) * 6)
  return Math.round(clamp(0, 100, g) * 10) / 10
}

export async function rankTickets(inputs: RankInput[]): Promise<RankedTicket[]> {
  await new Promise((resolve) => setTimeout(resolve, 120)) // like a network call
  const now = Date.now()
  return inputs
    .map((t) => ({ key: t.key, grade: dummyGrade(t, now) }))
    .sort((a, b) => b.grade - a.grade || a.key.localeCompare(b.key))
    .map((r, i) => ({ ...r, rank: i + 1 }))
}
