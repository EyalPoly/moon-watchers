import { expect, test } from 'vitest'
import { SCORE_DEFAULTS } from '../scoreSettings'
import { HOUSTON } from '../stations'
import type { Horizon } from '../types'
import { parseIsoMinute } from '../../time'
import { samples } from './samples'
import { syntheticSummary } from './synthetic'

const site = { lat_deg: -89, lon_deg: 10, slope_deg: 4 }
const scenario = { site: 'x', t0: '2027-03-01T00:00Z', days: 30, panel: 2, antenna: 3, station: HOUSTON, ...SCORE_DEFAULTS }
const landing = parseIsoMinute(scenario.t0) as number
const flat = (el: (number | null)[]): Horizon => ({
  ...samples.horizon.sample_a,
  mast_m: 2,
  elevation_deg: el,
  distance_km: el.map((v) => (v === null ? null : 10)),
  warnings: null,
})

test('a null band across the Sun path makes the Sun metrics unknown, not zero', () => {
  const band = Array.from({ length: 720 }, (_, i) => (i >= 200 && i < 216 ? null : -5))
  const s = syntheticSummary(scenario, site, flat(band), landing)
  expect(s.metrics).toMatchObject({ sun_pct: null, both_pct: null, sun_disk_mean: null })
  expect(s.metrics.unknown_h).toBeGreaterThan(0)
  expect(s.rag.sun.color).toBe('unknown')
  expect(s.windows.unknown.length).toBeGreaterThan(0)
  expect(s.score.warnings.map((w) => w.code)).toContain('NULL_GRADE:light')
  expect(s.warnings.map((w) => w.code)).toContain('NULL_GRADE:light')
  expect(typeof s.score.value).toBe('number')
  expect(s.daily.sun_pct.some((v) => v === null)).toBe(true)
  expect(s.daily.sun_pct.some((v) => v !== null)).toBe(true)
})

test('a dark run stops at unknown terrain', () => {
  const allDark = syntheticSummary(scenario, site, flat(Array(720).fill(89)), landing)
  const band = Array.from({ length: 720 }, (_, i) => (i >= 200 && i < 216 ? null : 89))
  const broken = syntheticSummary(scenario, site, flat(band), landing)
  expect(allDark.metrics.longest_dark_h).toBeGreaterThan(0)
  expect(broken.metrics.longest_dark_h).toBeLessThan(allDark.metrics.longest_dark_h)
  expect(broken.metrics.longest_dark_at_edge === false || broken.metrics.unknown_h > 0).toBe(true)
})

test('first sun and first dark are unknown when unknown terrain comes first', () => {
  const unknown = syntheticSummary(scenario, site, flat(Array(720).fill(null)), landing)
  expect(unknown.metrics.first_sun_h).toBeNull()
  expect(unknown.metrics.first_dark_after_landing_h).toBeNull()
  expect(unknown.windows.unknown).toHaveLength(1)
})
