// From the AI guide's JSON to new site cards. Everything here is plain code: each value
// the model gave is checked against the same limits as the card's own fields, and
// anything out of range falls back to the default with a note saying so.

import { HEIGHT_RANGE, roundCm } from '../api/heights'
import { formatLatLon, inPointArea, pointId, wrapLon } from '../api/points'
import { HOUSTON, type StationPreset } from '../api/stations'
import type { Site, StationPoint } from '../api/types'
import { EMPTY_TICKET, MAX_URL_TICKETS, cleanName, type Screen2State, type Ticket } from '../state/tickets'
import { MISSION_RANGE } from '../state/urlState'
import { formatIsoMinute, formatUtc, parseIsoMinute, STEP_MS } from '../time'
import type { Intent } from './intent'

export interface PlanContext {
  catalog: readonly Site[]
  stations: readonly StationPreset[]
}

export interface PlannedPoint {
  site: string
  /** What the user will recognise: the catalog name or the coordinates. */
  label: string
  /** True for a typed location (a custom point). */
  custom: boolean
}

export type Plan =
  | {
      kind: 'open'
      points: PlannedPoint[]
      settings: Pick<Ticket, 't0' | 'days' | 'panel' | 'antenna' | 'station'>
      name: string
      /** Values the app could not use, in plain words. */
      notes: string[]
    }
  | { kind: 'none'; notes: string[] }

const LANDING = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?Z?)?$/
const round2 = (v: number) => Math.round(v * 100) / 100
const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** YYYY-MM-DD or a UTC time, on the 10-minute grid and inside the mission range; null if not. */
export function parseLanding(text: string): string | null {
  const m = LANDING.exec(text.trim())
  if (!m) return null
  const ms = parseIsoMinute(`${m[1]}T${m[2] ?? '00'}:${m[3] ?? '00'}Z`)
  if (ms === null) return null
  const t0 = formatIsoMinute(Math.floor(ms / STEP_MS) * STEP_MS)
  return t0 >= MISSION_RANGE.first && t0 <= MISSION_RANGE.last ? t0 : null
}

function findSite(id: string, catalog: readonly Site[]): Site | undefined {
  const key = normal(id)
  return catalog.find((s) => s.id === id) ?? catalog.find((s) => normal(s.id) === key || normal(s.name) === key)
}

/** Checks the model's answer and turns it into the sites to open. */
export function intentToPlan(intent: Intent, ctx: PlanContext): Plan {
  const notes: string[] = []
  if (intent.action === 'none') return { kind: 'none', notes }

  const points: PlannedPoint[] = []
  const add = (p: PlannedPoint) => {
    if (!points.some((q) => q.site === p.site)) points.push(p)
  }
  if (intent.action === 'explore') {
    for (const s of ctx.catalog) add({ site: s.id, label: s.name, custom: false })
    if (ctx.catalog.length === 0) notes.push('The site list has not loaded yet, so there is nothing to open.')
  } else {
    for (const p of intent.points ?? []) {
      if (p.site_id !== undefined && p.site_id !== '') {
        const site = findSite(p.site_id, ctx.catalog)
        if (site) add({ site: site.id, label: site.name, custom: false })
        else notes.push(`There is no catalog site called "${p.site_id}".`)
      } else if (p.lat_deg !== undefined && p.lon_deg !== undefined) {
        const lon = wrapLon(p.lon_deg)
        if (inPointArea(p.lat_deg, lon)) add({ site: pointId(p.lat_deg, lon), label: formatLatLon(p.lat_deg, lon), custom: true })
        else notes.push(`${formatLatLon(p.lat_deg, lon)} is outside the south-pole area (84°S to 90°S).`)
      }
    }
    if (points.length === 0 && notes.length === 0) notes.push('The message did not name a site or a location.')
  }
  if (points.length === 0) return { kind: 'none', notes }

  let t0 = EMPTY_TICKET.t0
  if (intent.landing !== undefined && intent.landing !== '') {
    const parsed = parseLanding(intent.landing)
    if (parsed !== null) t0 = parsed
    else notes.push(`The landing date "${intent.landing}" is outside ${MISSION_RANGE.first.slice(0, 4)}–${MISSION_RANGE.last.slice(0, 4)} or unreadable, so the default is used.`)
  }

  let days = EMPTY_TICKET.days
  if (intent.days !== undefined) {
    if (intent.days >= 1 && intent.days <= 365) days = round2(intent.days)
    else notes.push(`A mission of ${intent.days} days is outside 1 to 365 days, so ${days} days is used.`)
  }

  const height = (value: number | undefined, fallback: number, what: string) => {
    if (value === undefined) return fallback
    if (value >= HEIGHT_RANGE.min && value <= HEIGHT_RANGE.max) return roundCm(value)
    notes.push(`A ${what} height of ${value} m is outside ${HEIGHT_RANGE.min} to ${HEIGHT_RANGE.max} m, so ${fallback} m is used.`)
    return fallback
  }
  const panel = height(intent.panel_m, EMPTY_TICKET.panel, 'panel')
  const antenna = height(intent.antenna_m, EMPTY_TICKET.antenna, 'antenna')

  let station: StationPoint = HOUSTON
  if (intent.station_id !== undefined && intent.station_id !== '') {
    const preset = ctx.stations.find((s) => s.id === intent.station_id) ?? ctx.stations.find((s) => normal(s.name).startsWith(normal(intent.station_id ?? '')))
    if (preset) station = preset.point
    else notes.push(`There is no Earth station called "${intent.station_id}", so Houston is used.`)
  }

  return { kind: 'open', points, settings: { t0, days, panel, antenna, station }, name: cleanName(intent.name ?? ''), notes }
}

function isBlankDraft(t: Ticket): boolean {
  return t.site === null && t.name === ''
}

/** Opens the planned sites: a lone empty draft is replaced, otherwise they are added at the end. */
export function applyPlan(s: Screen2State, plan: Extract<Plan, { kind: 'open' }>): { state: Screen2State; first: number; count: number } {
  const keep = s.tickets.length === 1 && isBlankDraft(s.tickets[0]) ? [] : s.tickets
  const room = Math.max(0, MAX_URL_TICKETS - keep.length)
  const many = plan.points.length > 1
  const added: Ticket[] = plan.points.slice(0, room).map((p) => ({
    ...EMPTY_TICKET,
    ...plan.settings,
    site: p.site,
    name: plan.name === '' ? '' : cleanName(many ? `${plan.name} · ${p.label}` : plan.name),
  }))
  const tickets = [...keep, ...added]
  const first = keep.length
  return {
    state: { tickets, open: added.length > 0 ? first : Math.min(s.open, tickets.length - 1), tau: 0, compare: false },
    first,
    count: added.length,
  }
}

const trimNumber = (v: number) => String(round2(v))

/** What was opened, from the checked values (never from the model's own words). */
export function describePlan(plan: Extract<Plan, { kind: 'open' }>, ctx: PlanContext, letters: string[], customIsSample: boolean): string {
  const names = plan.points.slice(0, letters.length).map((p, i) => `${letters[i]} ${p.label}`)
  const head = letters.length === 1 ? `Opened site ${names[0]}.` : `Opened ${letters.length} sites: ${names.join(', ')}.`
  const station = ctx.stations.find((s) => s.point.lat_deg === plan.settings.station.lat_deg && s.point.lon_deg === plan.settings.station.lon_deg)
  const ms = parseIsoMinute(plan.settings.t0) ?? 0
  const lines = [
    head,
    `Landing ${formatUtc(ms)} · ${trimNumber(plan.settings.days)} days on the Moon · panel ${trimNumber(plan.settings.panel)} m · antenna ${trimNumber(plan.settings.antenna)} m · ${station?.name.replace(/ \(.*\)$/, '') ?? 'custom station'}.`,
  ]
  if (letters.length < plan.points.length) lines.push(`${plan.points.length - letters.length} more did not fit (at most ${MAX_URL_TICKETS} sites).`)
  if (customIsSample && plan.points.some((p) => p.custom)) lines.push('Typed locations use sample data until the server supports custom points.')
  return [...lines, ...plan.notes].join('\n')
}
