import { z } from 'zod'
import { HEIGHT_RANGE, roundCm } from '../api/heights'
import { parseIsoMinute } from '../time'

export interface UrlState {
  site: string | null
}

const siteId = z.string().regex(/^[a-z0-9_]{1,64}$/)

export function parseUrlState(search: string, knownSiteIds: readonly string[]): UrlState {
  const parsed = siteId.safeParse(new URLSearchParams(search).get('site'))
  return { site: parsed.success && knownSiteIds.includes(parsed.data) ? parsed.data : null }
}

export function serializeUrlState(state: UrlState, base = ''): string {
  const params = new URLSearchParams(base)
  if (state.site === null) params.delete('site')
  else params.set('site', state.site)
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

// --- Mission (one card for now: spec §9.2) --------------------------------------------

export interface MissionState {
  /** Landing time, ISO minute on the 10-minute grid. */
  t0: string
  /** Mission length in days. */
  days: number
  /** Height of the solar panel above the ground, in meters. */
  panel: number
  /** Height of the antenna above the ground, in meters. */
  antenna: number
  /** Mission elapsed time being viewed, in minutes (multiple of 10). */
  tau: number
}

export const MISSION_RANGE = { first: '2026-01-01T00:00Z', last: '2030-12-31T23:50Z' }
export const MISSION_DEFAULTS: MissionState = { t0: '2027-03-01T00:00Z', days: 29.53, panel: 2, antenna: 3, tau: 0 }

const t0Param = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d0Z$/)
  .refine((t) => t >= MISSION_RANGE.first && t <= MISSION_RANGE.last)
  .refine((t) => parseIsoMinute(t) !== null)
const numberIn = (min: number, max: number) => z.coerce.number().finite().min(min).max(max)

function pick<T>(schema: z.ZodType<T>, raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : fallback
}

export function parseMission(search: string): MissionState {
  const p = new URLSearchParams(search)
  const d = MISSION_DEFAULTS
  const days = Math.round(pick(numberIn(1, 365), p.get('days'), d.days) * 100) / 100
  // Old links carried one mast height; it becomes the panel height.
  const panel = roundCm(pick(numberIn(HEIGHT_RANGE.min, HEIGHT_RANGE.max), p.get('panel') ?? p.get('mast'), d.panel))
  const antenna = roundCm(pick(numberIn(HEIGHT_RANGE.min, HEIGHT_RANGE.max), p.get('antenna'), d.antenna))
  const tauMax = Math.floor((days * 1440) / 10) * 10
  const tau = Math.min(tauMax, Math.round(pick(numberIn(0, 365 * 1440), p.get('tau'), d.tau) / 10) * 10)
  return { t0: pick(t0Param, p.get('t0'), d.t0), days, panel, antenna, tau }
}

/** Writes only non-default values, in a fixed order, so equal states give equal URLs. */
export function serializeMission(state: MissionState, base = ''): string {
  const params = new URLSearchParams(base)
  params.delete('mast')
  for (const key of ['t0', 'days', 'panel', 'antenna', 'tau'] as const) {
    params.delete(key)
    if (state[key] !== MISSION_DEFAULTS[key]) params.set(key, String(state[key]))
  }
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}
