// Synthetic sample answers for the time-dependent endpoints (build approach §6).
//
// FAKE BUT SHAPED RIGHT. These curves only mimic what a south-polar site sees: a Sun that
// circles the sky once per lunar day while skimming the horizon, and an Earth that stays
// in one part of the sky and wobbles with libration. They are not physics and never leave
// the mock layer: the real numbers come from the engine. Every screen that shows them
// carries the "Sample data" label.

import meta from '@samples/meta.json'
import type { ApiWarning, Horizon, Scenario, Series, Site, StationPoint, Summary } from '../types'
import { DAY_MS, STEP_MS, formatIsoMinute, monthEndMs, monthStartMs } from '../../time'
import { HOUSTON } from '../stations'
import { makeWarning, mockScore, sortWarnings } from './score'

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

/** Mast height lowers each horizon sample by about atan(Δh / distance). Unknown stays unknown. */
export function horizonAtMast(base: Horizon, mast: number): Horizon {
  const dh = mast - base.mast_m
  if (dh === 0) return base
  const elevation_deg = base.elevation_deg.map((el, i) => {
    const distance = base.distance_km[i]
    if (el === null || distance === null) return el
    const distM = Math.max(distance, 0.2) * 1000
    return Math.round((el - (Math.atan(dh / distM) * 180) / Math.PI) * 1000) / 1000
  })
  return { ...base, mast_m: mast, elevation_deg }
}

/** The skyline at an azimuth; null where the terrain is unknown. */
export function horizonAt(h: Horizon, az: number): number | null {
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

// The Moon crosses a station's sky once every ~24.8 h, shifted by the station's longitude.
// It is above a 0° mask for about half of that, a little less far from the equator, and
// a higher mask shortens it.
const MOON_TRANSIT_D = 1.035
const stationPhase = (st: StationPoint, days: number) => TAU * (days / MOON_TRANSIT_D + st.lon_deg / 360)

function moonElevation(st: StationPoint, days: number): number {
  const threshold = -0.15 + Math.abs(st.lat_deg) / 300
  return 60 * (Math.sin(stationPhase(st, days)) - threshold)
}

function sunLitFraction(el: number, horizon: number): number {
  const x = (el - horizon) / SUN_RADIUS_DEG
  if (x >= 1) return 1
  if (x <= -1) return 0
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
// A fraction above zero is never written as 0: the web app reads "> 0" as "visible".
const r4 = (v: number) => (v > 0 ? Math.max(0.0001, Math.round(v * 10000) / 10000) : 0)
const wrap360 = (az: number) => ((az % 360) + 360) % 360

export interface SeriesOptions {
  station?: StationPoint
  /** The skyline at the antenna's height; the panel skyline when absent. */
  antennaHorizon?: Horizon
}

/**
 * `horizon` is the skyline at the panel's height: it decides the Sun. The antenna's skyline
 * decides the Earth and the station. A null skyline value gives null in every field that
 * reads it, except where a known "no" settles the answer.
 */
export function syntheticSeries(
  site: SiteLike,
  horizon: Horizon,
  startMs: number,
  n: number,
  { station = HOUSTON, antennaHorizon = horizon }: SeriesOptions = {},
): Series {
  const s: Series = {
    start: formatIsoMinute(startMs),
    step_s: STEP_MS / 1000,
    n,
    sun_az: [], sun_el: [], sun_vis_el: [], sun_horizon_el: [], sun_lit_frac: [],
    earth_az: [], earth_el: [], earth_vis_el: [], earth_horizon_el: [], earth_any: [], earth_whole: [],
    contact: [], station_az: [], station_el: [], station_horizon_el: [], earth_station_up: [], station_moon_el: [],
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
    const earthH = horizonAt(antennaHorizon, earth.az)

    const moonEl = moonElevation(station, d)
    const up = moonEl >= station.min_el_deg
    // The station sits somewhere on the Earth's disk, which turns once a day.
    const phase = stationPhase(station, d)
    const stationAz = wrap360(earth.az + (EARTH_RADIUS_DEG * Math.cos(rad(station.lat_deg)) * Math.cos(phase)) / Math.max(Math.cos(rad(earth.el)), 0.2))
    const stationEl = earth.el + EARTH_RADIUS_DEG * Math.sin(rad(station.lat_deg)) * 0.9
    const stationH = horizonAt(antennaHorizon, stationAz)

    s.sun_az.push(r3(sun.az))
    s.sun_el.push(r3(sun.el))
    s.sun_vis_el.push(r3(sun.el + SUN_RADIUS_DEG))
    s.sun_horizon_el.push(sunH === null ? null : r3(sunH))
    s.sun_lit_frac.push(sunH === null ? null : r4(sunLitFraction(sun.el, sunH)))
    s.earth_az.push(r3(earth.az))
    s.earth_el.push(r3(earth.el))
    s.earth_vis_el.push(up ? r3(stationEl) : 90)
    s.earth_horizon_el.push(earthH === null ? null : r3(earthH))
    s.earth_any.push(earthH === null ? null : earth.el + EARTH_RADIUS_DEG > earthH ? 1 : 0)
    s.earth_whole.push(earthH === null ? null : earth.el - EARTH_RADIUS_DEG >= earthH ? 1 : 0)
    s.station_az.push(r3(stationAz))
    s.station_el.push(r3(stationEl))
    s.station_horizon_el.push(stationH === null ? null : r3(stationH))
    s.contact.push(!up ? 0 : stationH === null ? null : stationEl > stationH ? 1 : 0)
    s.earth_station_up.push(up)
    s.station_moon_el.push(r3(moonEl))
  }
  return s
}

export function monthSeries(site: SiteLike, horizon: Horizon, month: string, options: SeriesOptions = {}): Series {
  const start = monthStartMs(month)
  const n = Math.round((monthEndMs(month) - start) / STEP_MS)
  return syntheticSeries(site, horizon, start, n, options)
}

// --- Summary ---------------------------------------------------------------------------

const HOUR_MS = 3_600_000
const STEPS_PER_DAY = 144
const ORIENTATION_OBSERVED_UNTIL = Date.UTC(2026, 7, 6)

type State = 0 | 1 | null

const round = (v: number, decimals: number) => Math.round(v * 10 ** decimals) / 10 ** decimals
const hours = (steps: number) => round((steps * STEP_MS) / HOUR_MS, 2)

/** The mean of the values, or null when any is unknown. */
function mean(values: readonly (number | null)[]): number | null {
  let sum = 0
  for (const v of values) {
    if (v === null) return null
    sum += v
  }
  return values.length === 0 ? null : sum / values.length
}

function windowsOf(states: readonly State[], startMs: number, match: (s: State) => boolean): [string, string][] {
  const out: [string, string][] = []
  let open = -1
  for (let i = 0; i <= states.length; i++) {
    const on = i < states.length && match(states[i])
    if (on && open < 0) open = i
    if (!on && open >= 0) {
      out.push([formatIsoMinute(startMs + open * STEP_MS), formatIsoMinute(startMs + i * STEP_MS)])
      open = -1
    }
  }
  return out
}

/** The longest run of 0 steps and whether it touches either end; unknown steps break a run. */
function longestRun(states: readonly State[]): { steps: number; atEdge: boolean } {
  let best = { steps: 0, atEdge: false }
  let run = 0
  for (let i = 0; i < states.length; i++) {
    run = states[i] === 0 ? run + 1 : 0
    if (run > best.steps) best = { steps: run, atEdge: i + 1 - run === 0 || i === states.length - 1 }
  }
  return best
}

/** Steps from the start while the Sun is up; null when the run ends in unknown terrain. */
function firstSunSteps(sun: readonly State[]): number | null {
  const end = sun.findIndex((s) => s !== 1)
  if (end < 0) return sun.length
  return sun[end] === null ? null : end
}

/** Steps from landing to the first dark one; null when unknown terrain comes first. */
function firstDarkSteps(sun: readonly State[], landing: number): number | null {
  for (let i = landing; i < sun.length; i++) {
    if (sun[i] === 0) return i - landing
    if (sun[i] === null) return null
  }
  return sun.length - landing
}

// Stands in for the engine's dust index: smooth, in [0, 1] and fixed per place, but not
// the same waves, so it is only ever shown as simulated.
const DUST_WAVES = [0.3, 1.7, 2.9, 4.1, 5.3, 0.9].map((a, k) => ({ a, p: 1 + 0.8 * k }))
function dustIndex(lat: number, lon: number): number {
  const rho = 2 * 1_737_400 * Math.tan((rad(90 + lat)) / 2)
  const [x, y] = [rho * Math.sin(rad(lon)), rho * Math.cos(rad(lon))]
  const waves = DUST_WAVES.reduce((sum, { a, p }) => sum + Math.sin((x * Math.cos(a) + y * Math.sin(a)) / 5000 + p), 0)
  return round(Math.min(1, Math.max(0, 0.5 + waves / DUST_WAVES.length / 2)), 2)
}

const RAG = meta.rag
type Color = 'green' | 'amber' | 'red'
const pctColor = (pct: number): Color => (pct >= RAG.pct.green_from ? 'green' : pct >= RAG.pct.amber_from ? 'amber' : 'red')
const slopeColor = (deg: number): Color => (deg <= RAG.slope_deg.green_max ? 'green' : deg <= RAG.slope_deg.amber_max ? 'amber' : 'red')

function pctChip(name: string, unavailable: string, pct: number | null, unknownH: number): Summary['rag']['sun'] {
  if (pct === null) {
    return { color: 'unknown', reason: `${unavailable} unavailable: terrain unknown for ${unknownH} h of the mission` }
  }
  return {
    color: pctColor(pct),
    reason: `${name} ${pct.toFixed(1)}% of the mission (green ≥ ${RAG.pct.green_from}%, red < ${RAG.pct.amber_from}%)`,
  }
}

/** `horizon` is the site's skyline at any height; the panel's and the antenna's are derived from it. */
export function syntheticSummary(
  scenario: Scenario,
  site: SiteLike & Pick<Site, 'slope_deg'> & { in_psr?: boolean | null },
  horizon: Horizon,
  landingMs: number,
): Summary {
  const margin = scenario.margin
  const n = margin * 6 + Math.floor(scenario.days * STEPS_PER_DAY + 0.5)
  const startMs = landingMs - margin * HOUR_MS
  const s = syntheticSeries(site, horizonAtMast(horizon, scenario.panel), startMs, n, {
    station: scenario.station,
    antennaHorizon: horizonAtMast(horizon, scenario.antenna),
  })
  const sun = s.sun_lit_frac.map((f): State => (f === null ? null : f > 0 ? 1 : 0))
  const contact = s.contact.map((c): State => (c === null ? null : c === 1 ? 1 : 0))
  const both = sun.map((v, i): State => (v === 1 && contact[i] === 1 ? 1 : v === 0 || contact[i] === 0 ? 0 : null))
  const pct = (states: readonly State[]) => {
    const m = mean(states)
    return m === null ? null : round(100 * m, 2)
  }
  const mean4 = (values: readonly (number | null)[]) => {
    const m = mean(values)
    return m === null ? null : round(m, 4)
  }

  const dark = longestRun(sun)
  const outage = longestRun(contact)
  const firstSun = firstSunSteps(sun)
  const firstDark = firstDarkSteps(sun, margin * 6)
  const unknownSteps = sun.filter((v, i) => v === null || contact[i] === null).length
  const unknownH = hours(unknownSteps)
  const earthEl = s.earth_el
  const sunDiskMean = mean4(s.sun_lit_frac)
  const contactMean = mean4(contact)

  const metrics: Summary['metrics'] = {
    sun_pct: pct(sun),
    dte_pct: pct(contact),
    both_pct: pct(both),
    sun_disk_mean: sunDiskMean,
    contact_mean: contactMean,
    earth_any_pct: pct(s.earth_any as State[]),
    earth_whole_pct: pct(s.earth_whole as State[]),
    longest_dark_h: hours(dark.steps),
    longest_no_contact_h: hours(outage.steps),
    longest_dark_at_edge: dark.atEdge,
    longest_no_contact_at_edge: outage.atEdge,
    first_sun_h: firstSun === null ? null : hours(firstSun),
    first_dark_after_landing_h: firstDark === null ? null : hours(firstDark),
    window: [formatIsoMinute(startMs), formatIsoMinute(startMs + n * STEP_MS)],
    earth_el_range: [round(Math.min(...earthEl), 2), round(Math.max(...earthEl), 2)],
    unknown_h: unknownH,
  }

  const windowH = (n * STEP_MS) / HOUR_MS
  const score = mockScore(
    {
      L: metrics.sun_disk_mean,
      C: metrics.contact_mean,
      DK: metrics.longest_dark_h,
      OT: metrics.longest_no_contact_h,
      LS: metrics.first_sun_h,
      S: site.slope_deg,
      D: dustIndex(site.lat_deg, site.lon_deg),
    },
    site.slope_deg,
    site.in_psr ?? null,
    scenario,
    windowH,
  )

  const bins = Math.ceil(n / STEPS_PER_DAY)
  const perBin = <T,>(values: readonly T[], reduce: (bin: T[]) => number | null) =>
    Array.from({ length: bins }, (_, d) => reduce(values.slice(d * STEPS_PER_DAY, (d + 1) * STEPS_PER_DAY)))
  const daily: Summary['daily'] = {
    sun_pct: perBin(sun, (bin) => pct(bin)),
    dte_pct: perBin(contact, (bin) => pct(bin)),
    sun_disk_mean: perBin(s.sun_lit_frac, (bin) => mean4(bin)),
  }

  const data: ApiWarning[] = [
    ...(horizon.warnings ?? []).flatMap((code) => {
      try {
        return [makeWarning(code)]
      } catch {
        return []
      }
    }),
    ...(startMs + n * STEP_MS > ORIENTATION_OBSERVED_UNTIL ? [makeWarning('EARTH_ORIENTATION_PREDICTED')] : []),
  ]

  return {
    scenario,
    version: 'sample',
    metrics,
    rag: {
      sun: pctChip('Sun visible', 'Sun visibility', metrics.sun_pct, unknownH),
      dte: pctChip('Earth in contact', 'Earth contact', metrics.dte_pct, unknownH),
      slope: {
        color: slopeColor(site.slope_deg),
        reason: `Slope ${site.slope_deg.toFixed(1)}° (green ≤ ${RAG.slope_deg.green_max}°, red > ${RAG.slope_deg.amber_max}°)`,
      },
    },
    score,
    windows: {
      sun: windowsOf(sun, startMs, (v) => v === 1),
      dte: windowsOf(contact, startMs, (v) => v === 1),
      both: windowsOf(both, startMs, (v) => v === 1),
      unknown: windowsOf(sun.map((v, i): State => (v === null || contact[i] === null ? null : 1)), startMs, (v) => v === null),
    },
    daily,
    warnings: sortWarnings([...data, ...score.warnings]),
  }
}
