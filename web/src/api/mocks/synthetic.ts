// Synthetic sample answers for the time-dependent endpoints (build approach §6).
//
// FAKE BUT SHAPED RIGHT. These curves only mimic what a south-polar site sees: a Sun that
// circles the sky once per lunar day while skimming the horizon, and an Earth that stays
// in one part of the sky and wobbles with libration. They are not physics and never leave
// the mock layer: the real numbers come from the engine. Every screen that shows them
// carries the "Sample data" label.

import type { Horizon, Scenario, Series, Summary } from '../types'
import { DAY_MS, STEP_MS, formatIsoMinute, monthEndMs, monthStartMs } from '../../time'

export const SUN_RADIUS_DEG = 0.267
export const EARTH_RADIUS_DEG = 0.95

const EPOCH = Date.UTC(2026, 0, 1)
const SYNODIC_D = 29.530589
const DRACONIC_D = 27.212221
const ANOMALISTIC_D = 27.554550
const ECLIPTIC_YEAR_D = 346.62
const TAU = 2 * Math.PI
const rad = (deg: number) => (deg * Math.PI) / 180

export interface SiteLike {
  lat_deg: number
  lon_deg: number
}

/** Mast height lowers each horizon sample by about atan(Δh / distance). */
export function horizonAtMast(base: Horizon, mast: number): Horizon {
  const dh = mast - base.mast_m
  if (dh === 0) return base
  const elevation_deg = base.elevation_deg.map((el, i) => {
    const distM = Math.max(base.distance_km[i], 0.2) * 1000
    return Math.round((el - (Math.atan(dh / distM) * 180) / Math.PI) * 1000) / 1000
  })
  return { ...base, mast_m: mast, elevation_deg }
}

export function horizonAt(h: Horizon, az: number): number {
  const n = h.elevation_deg.length
  const i = Math.round(az / h.az_step_deg) % n
  return h.elevation_deg[(i + n) % n]
}

// Elevation and azimuth of a body above sub-point (lat, lon) for a near-polar site: the
// site sits `colat` degrees from the pole, so a body over its own meridian is `colat`
// higher and one over the far side `colat` lower.
function skyPosition(site: SiteLike, subLat: number, subLon: number) {
  const colat = 90 - Math.abs(site.lat_deg)
  const dLon = subLon - site.lon_deg
  const el = -subLat + colat * Math.cos(rad(dLon))
  const az = (((dLon % 360) + 360) % 360)
  return { el, az }
}

export interface StationLocation {
  lat_deg: number
  lon_deg: number
}

/** "any": contact while at least one DSN complex sees the Moon. */
export type StationChoice = 'any' | StationLocation

// Same coordinates as the meta sample's station list.
export const DSN: Record<'goldstone' | 'madrid' | 'canberra', StationLocation> = {
  goldstone: { lat_deg: 35.4267, lon_deg: -116.89 },
  madrid: { lat_deg: 40.4314, lon_deg: -4.2481 },
  canberra: { lat_deg: -35.4014, lon_deg: 148.9819 },
}

export function stationOf(scenario: Scenario): StationChoice {
  if (scenario.station === 'any') return 'any'
  if (scenario.station === 'custom') {
    return { lat_deg: scenario.station_lat_deg ?? 0, lon_deg: scenario.station_lon_deg ?? 0 }
  }
  return DSN[scenario.station]
}

// The Moon crosses a station's sky once every ~24.8 h, shifted by the station's longitude,
// and stays above its 10° mask for about half of that; a little less far from the equator.
const MOON_TRANSIT_D = 1.035
function moonUpAt(st: StationLocation, days: number): boolean {
  const threshold = -0.15 + Math.abs(st.lat_deg) / 300
  return Math.sin(TAU * (days / MOON_TRANSIT_D + st.lon_deg / 360)) > threshold
}

function stationUp(station: StationChoice, days: number): boolean {
  return station === 'any' ? Object.values(DSN).some((st) => moonUpAt(st, days)) : moonUpAt(station, days)
}

function sunLitFraction(el: number, horizon: number): number {
  const x = (el - horizon) / SUN_RADIUS_DEG
  if (x >= 1) return 1
  if (x <= -1) return 0
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI
}

const r3 = (v: number) => Math.round(v * 1000) / 1000

export function syntheticSeries(
  site: SiteLike,
  horizon: Horizon,
  startMs: number,
  n: number,
  station: StationChoice = 'any',
): Series {
  const s: Series = {
    start: formatIsoMinute(startMs),
    step_s: STEP_MS / 1000,
    n,
    sun_az: [], sun_el: [], sun_vis_el: [], sun_horizon_el: [], sun_lit_frac: [],
    earth_az: [], earth_el: [], earth_vis_el: [], earth_horizon_el: [], earth_visible: [],
    earth_station_up: [],
    power_w: null,
    soc_pct: null,
  }
  for (let i = 0; i < n; i++) {
    const d = (startMs + i * STEP_MS - EPOCH) / DAY_MS
    const sun = skyPosition(site, 1.54 * Math.sin((TAU * d) / ECLIPTIC_YEAR_D), 40 - (360 * d) / SYNODIC_D)
    const earth = skyPosition(
      site,
      6.7 * Math.sin((TAU * d) / DRACONIC_D),
      7.9 * Math.sin((TAU * d) / ANOMALISTIC_D),
    )
    const sunH = horizonAt(horizon, sun.az)
    const earthH = horizonAt(horizon, earth.az)
    const up = stationUp(station, d)
    const earthVis = earth.el - EARTH_RADIUS_DEG
    s.sun_az.push(r3(sun.az))
    s.sun_el.push(r3(sun.el))
    s.sun_vis_el.push(r3(sun.el + SUN_RADIUS_DEG))
    s.sun_horizon_el.push(r3(sunH))
    s.sun_lit_frac.push(r3(sunLitFraction(sun.el, sunH)))
    s.earth_az.push(r3(earth.az))
    s.earth_el.push(r3(earth.el))
    s.earth_vis_el.push(up ? r3(earthVis) : 90)
    s.earth_horizon_el.push(r3(earthH))
    s.earth_visible.push(up && earthVis > earthH)
    s.earth_station_up.push(up)
  }
  return s
}

export function monthSeries(
  site: SiteLike,
  horizon: Horizon,
  month: string,
  station: StationChoice = 'any',
): Series {
  const start = monthStartMs(month)
  const n = Math.round((monthEndMs(month) - start) / STEP_MS)
  return syntheticSeries(site, horizon, start, n, station)
}

// --- Summary ---------------------------------------------------------------------------

function pctColor(pct: number) {
  return pct >= 60 ? 'green' : pct >= 30 ? 'amber' : 'red'
}

function slopeColor(deg: number) {
  return deg <= 5 ? 'green' : deg <= 10 ? 'amber' : 'red'
}

function slopePenalty(deg: number): number {
  if (deg <= 5) return 0
  if (deg <= 10) return ((deg - 5) / 5) * 30
  return 30
}

function windowsOf(flags: boolean[], startMs: number): [string, string][] {
  const out: [string, string][] = []
  let open = -1
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i]
    if (on && open < 0) open = i
    if (!on && open >= 0) {
      out.push([formatIsoMinute(startMs + open * STEP_MS), formatIsoMinute(startMs + i * STEP_MS)])
      open = -1
    }
  }
  return out
}

function longestOff(flags: boolean[]): number {
  let best = 0
  let run = 0
  for (const f of flags) {
    run = f ? 0 : run + 1
    best = Math.max(best, run)
  }
  return best
}

const pct = (flags: boolean[]) => (flags.length ? (100 * flags.filter(Boolean).length) / flags.length : 0)
const r1 = (v: number) => Math.round(v * 10) / 10
const hours = (steps: number) => r1((steps * STEP_MS) / 3_600_000)

export function syntheticSummary(
  scenario: Scenario,
  site: SiteLike & { slope_deg: number },
  horizon: Horizon,
  t0Ms: number,
): Summary {
  const n = Math.round((scenario.days * DAY_MS) / STEP_MS)
  const s = syntheticSeries(site, horizon, t0Ms, n, stationOf(scenario))
  const sun = s.sun_lit_frac.map((f) => f > 0)
  const dte = s.earth_visible
  const both = sun.map((v, i) => v && dte[i])
  const S = pct(sun)
  const D = pct(dte)
  const B = pct(both)
  const firstDark = sun.indexOf(false)

  const [wSun, wDte, wSlope, wDust] = scenario.w
  const base =
    100 *
    ((1 - wSun) * (1 - wDte) +
      (wSun * (1 - wDte) * S) / 100 +
      ((1 - wSun) * wDte * D) / 100 +
      (wSun * wDte * B) / 100)
  const slopePts = wSlope * slopePenalty(site.slope_deg)
  const value = Math.min(100, Math.max(0, base - slopePts))
  // Split the points lost below 100 between Sun and Earth by how often each was missing.
  const lost = 100 - base
  const missSun = wSun * (100 - S)
  const missDte = wDte * (100 - D)
  const share = missSun + missDte > 0 ? missSun / (missSun + missDte) : 0.5
  const factors = [
    { name: 'sun', weight: wSun, points: r1(-lost * share), reason: `Sun visible ${r1(S)}% of the mission` },
    { name: 'dte', weight: wDte, points: r1(-lost * (1 - share)), reason: `Earth in contact ${r1(D)}% of the mission` },
    { name: 'slope', weight: wSlope, points: r1(-slopePts), reason: `Slope ${site.slope_deg.toFixed(1)}°` },
  ]
  const deciding = factors.reduce((a, b) => (b.points < a.points ? b : a)).name

  const days = Math.ceil(scenario.days)
  const perDay = 144
  const daily = { sun_pct: [] as number[], dte_pct: [] as number[] }
  for (let d = 0; d < days; d++) {
    daily.sun_pct.push(r1(pct(sun.slice(d * perDay, (d + 1) * perDay))))
    daily.dte_pct.push(r1(pct(dte.slice(d * perDay, (d + 1) * perDay))))
  }
  const earthEl = s.earth_el
  return {
    scenario,
    version: 'sample',
    metrics: {
      sun_pct: r1(S),
      dte_pct: r1(D),
      both_pct: r1(B),
      longest_dark_h: hours(longestOff(sun)),
      longest_no_contact_h: hours(longestOff(dte)),
      first_dark_after_landing_h: firstDark < 0 ? hours(n) : hours(firstDark),
      earth_el_range: [r1(Math.min(...earthEl)), r1(Math.max(...earthEl))],
    },
    rag: {
      sun: { color: pctColor(S), reason: `Sun visible ${r1(S)}% of the mission (green ≥ 60%, red < 30%)` },
      dte: { color: pctColor(D), reason: `Earth in contact ${r1(D)}% of the mission (green ≥ 60%, red < 30%)` },
      slope: {
        color: slopeColor(site.slope_deg),
        reason: `Slope ${site.slope_deg.toFixed(1)}° (green ≤ 5°, red > 10°)`,
      },
    },
    score: {
      value: r1(value),
      base: r1(base),
      weights: { sun: wSun, dte: wDte, slope: wSlope, dust: wDust },
      factors,
      deciding,
      formula: 'interim: base = share of time with every weighted body visible; score = base − slope penalty',
      color: value >= 70 ? 'green' : value >= 40 ? 'amber' : 'red',
    },
    windows: {
      sun: windowsOf(sun, t0Ms),
      dte: windowsOf(dte, t0Ms),
      both: windowsOf(both, t0Ms),
    },
    daily,
    warnings: [],
  }
}
