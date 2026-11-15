// Screen 2 state: the mission tickets, which one is open, the shared mission time and
// whether the compare view is showing. All of it lives in the URL (spec §9.2), so a set of
// tickets can be shared, reloaded and undone with Back.
//
//   ?tk=sample_a~2027-03-01T00:00Z~29.53~2~3&tk=~2027-06-01T00:00Z~14~2~3~g~h~s:40.4,-4.2,0,0&open=1&tau=60
//
// Each `tk` is site~t0~days~panel~antenna, then optional flags in any order:
//   g                 show the sky graph instead of the map
//   h                 hidden: not shown in the main area
//   n:<text>          the ticket's name (no "~", at most 40 characters)
//   s:<lat,lon,alt,mask>  the Earth station (default: Houston, written only when it differs)
// An empty site is a ticket still being filled in. Old links still open: a ticket with one
// mast height (site~t0~days~mast, with the old s:<preset> and s:@lat,lon flags) and the
// one-site form (?site=…&t0=…).

import { z } from 'zod'
import { HEIGHT_RANGE, roundCm } from '../api/heights'
import { HOUSTON, sameStation, stationFromUrl, stationQuery, stationToUrl } from '../api/stations'
import type { StationPoint } from '../api/types'
import { parseIsoMinute } from '../time'
import { MISSION_DEFAULTS, MISSION_RANGE, parseMission } from './urlState'

/** No limit in the app; this only stops a hostile link from creating thousands. */
export const MAX_URL_TICKETS = 50

export type PanelView = 'map' | 'graph'

export interface Ticket {
  site: string | null
  t0: string
  days: number
  /** Height of the solar panel, in meters. */
  panel: number
  /** Height of the antenna, in meters. */
  antenna: number
  /** The Earth station the antenna talks to. */
  station: StationPoint
  /** Chosen stations in the picker. The existing calculator uses the displayed station above. */
  stationChoices?: StationPoint[]
  editing?: boolean
  collapsed?: boolean
  view: PanelView
  /** Shown in the main area (the user picks which tickets show there). */
  shown: boolean
  /** The user's name for the ticket; empty shows "Ticket N". */
  name: string
}

export interface Screen2State {
  tickets: Ticket[]
  /** Index of the ticket shown open in the side panel; -1 when all are collapsed. */
  open: number
  /** Mission elapsed time being viewed, in minutes, shared by every ticket (spec §9.2). */
  tau: number
  compare: boolean
}

export const EMPTY_TICKET: Ticket = {
  site: null,
  t0: MISSION_DEFAULTS.t0,
  days: MISSION_DEFAULTS.days,
  panel: MISSION_DEFAULTS.panel,
  antenna: MISSION_DEFAULTS.antenna,
  station: HOUSTON,
  view: 'map',
  shown: true,
  name: '',
}

const siteId = z.string().regex(/^[a-z0-9_]{1,64}$/)
const t0Field = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d0Z$/)
  .refine((t) => t >= MISSION_RANGE.first && t <= MISSION_RANGE.last && parseIsoMinute(t) !== null)
const daysField = z.coerce.number().finite().min(1).max(365)
const heightField = z.coerce.number().finite().min(HEIGHT_RANGE.min).max(HEIGHT_RANGE.max)
const HEIGHT_TOKEN = /^[\d.]*$/

const round2 = (v: number) => Math.round(v * 100) / 100

export const MAX_NAME_LENGTH = 40

/** Names can't hold the URL separator "~", and are trimmed and capped. */
export function cleanName(name: string): string {
  return name.replace(/~/g, '-').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

/** New tickets for points (e.g. areas picked on the map), copying a ticket's settings. */
export function addTicketsFor(s: Screen2State, from: number, points: { site: string; name: string }[]): Screen2State {
  const base = s.tickets[from] ?? EMPTY_TICKET
  const added = points.map((p) => ({ ...base, site: p.site, editing: undefined, collapsed: undefined, name: cleanName(p.name), view: 'map' as const, shown: true }))
  const tickets = [...s.tickets, ...added]
  return { ...s, tickets, open: added.length > 0 ? s.tickets.length : s.open, compare: false }
}

/** A ticket from its URL form; any broken field falls back to its default. */
function parseTicket(raw: string): Ticket {
  const [site = '', t0 = '', days = '', panel = '', ...rest] = raw.split('~')
  // An old link has flags straight after the mast height; the antenna height is a number.
  const hasAntenna = rest.length > 0 && HEIGHT_TOKEN.test(rest[0])
  const antenna = hasAntenna ? rest[0] : ''
  const flags = hasAntenna ? rest.slice(1) : rest
  const pick = <T>(schema: z.ZodType<T>, value: string, fallback: T) => {
    const parsed = schema.safeParse(value)
    return value !== '' && parsed.success ? parsed.data : fallback
  }
  const station = flags
    .filter((f) => f.startsWith('s:'))
    .map((f) => stationFromUrl(f.slice(2)))
    .find((s) => s !== null)
  const choicesToken = flags.find((f) => f.startsWith('stations:'))?.slice(9)
  const choices = (choicesToken?.split('|').slice(0, 6) ?? []).flatMap((token) => stationFromUrl(token) ?? [])
  const active = station ?? HOUSTON
  return {
    ...(choices.length > 1 && choices.some((s) => sameStation(s, active)) ? { stationChoices: choices } : {}),
    ...(flags.includes('edit') ? { editing: true } : {}),
    ...(flags.includes('fold') ? { collapsed: true } : {}),
    site: pick(siteId, site, null),
    t0: pick(t0Field, t0, EMPTY_TICKET.t0),
    days: round2(pick(daysField, days, EMPTY_TICKET.days)),
    panel: roundCm(pick(heightField, panel, EMPTY_TICKET.panel)),
    antenna: roundCm(pick(heightField, antenna, EMPTY_TICKET.antenna)),
    station: active,
    view: flags.includes('g') ? 'graph' : 'map',
    shown: !flags.includes('h'),
    name: cleanName(flags.find((f) => f.startsWith('n:'))?.slice(2) ?? ''),
  }
}

function ticketToUrl(t: Ticket): string {
  const parts: (string | number)[] = [t.site ?? '', t.t0, t.days, t.panel, t.antenna]
  if (t.stationChoices && t.stationChoices.length > 1) parts.push(`stations:${t.stationChoices.map(stationQuery).join('|')}`)
  if (t.editing) parts.push('edit')
  if (t.collapsed) parts.push('fold')
  if (t.view === 'graph') parts.push('g')
  if (!t.shown) parts.push('h')
  if (t.name !== '') parts.push(`n:${cleanName(t.name)}`)
  const station = stationToUrl(t.station)
  if (station !== null) parts.push(`s:${station}`)
  return parts.join('~')
}

export function maxTau(tickets: readonly Ticket[]): number {
  const longest = Math.max(...tickets.map((t) => t.days))
  return Math.floor((longest * 1440) / 10) * 10
}

/** Tickets that can be compared: shown, with a site. */
export function comparableCount(tickets: readonly Ticket[]): number {
  return tickets.filter((t) => t.shown && t.site !== null).length
}

export function parseScreen2(search: string): Screen2State {
  const params = new URLSearchParams(search)
  let tickets = params.getAll('tk').slice(0, MAX_URL_TICKETS).map(parseTicket)
  if (tickets.length === 0) {
    // An old one-site link, or a fresh start: a single ticket.
    const legacy = parseMission(search)
    const site = siteId.safeParse(params.get('site'))
    tickets = [
      {
        ...EMPTY_TICKET,
        site: site.success ? site.data : null,
        t0: legacy.t0,
        days: legacy.days,
        panel: legacy.panel,
        antenna: legacy.antenna,
      },
    ]
  }
  const open = Number(params.get('open') ?? 0)
  const tauRaw = Number(params.get('tau') ?? 0)
  const tau = Number.isFinite(tauRaw) && tauRaw > 0 ? Math.min(maxTau(tickets), Math.round(tauRaw / 10) * 10) : 0
  return {
    tickets,
    open: Number.isInteger(open) && open >= -1 && open < tickets.length ? open : 0,
    tau,
    compare: params.get('view') === 'compare' && comparableCount(tickets) >= 2,
  }
}

const OWN_KEYS = ['tk', 'open', 'tau', 'view', 'site', 't0', 'days', 'mast', 'panel', 'antenna']

/** Writes the state in a fixed order and leaves unrelated parameters (like data=sample) alone. */
export function serializeScreen2(state: Screen2State, base = ''): string {
  const params = new URLSearchParams(base)
  for (const key of OWN_KEYS) params.delete(key)
  const blank =
    state.tickets.length === 1 && JSON.stringify(state.tickets[0]) === JSON.stringify(EMPTY_TICKET)
  if (!blank) for (const t of state.tickets) params.append('tk', ticketToUrl(t))
  if (state.open !== 0) params.set('open', String(state.open))
  if (state.tau !== 0) params.set('tau', String(state.tau))
  if (state.compare) params.set('view', 'compare')
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

// --- Actions: each returns the next state ---------------------------------------------

export function updateTicket(s: Screen2State, i: number, patch: Partial<Ticket>): Screen2State {
  const tickets = s.tickets.map((t, k) => (k === i ? { ...t, ...patch } : t))
  const compare = s.compare && comparableCount(tickets) >= 2
  return { ...s, tickets, compare, tau: Math.min(s.tau, maxTau(tickets)) }
}

/** A new ticket starts from the open one's dates, heights and station, with no site yet, and opens. */
export function addTicket(s: Screen2State): Screen2State {
  const from = s.tickets[s.open] ?? EMPTY_TICKET
  const tickets = [...s.tickets, { ...from, site: null, editing: undefined, collapsed: undefined, view: 'map' as const, shown: true, name: '' }]
  return { ...s, tickets, open: tickets.length - 1, compare: false }
}

export function removeTicket(s: Screen2State, i: number): Screen2State {
  const tickets = s.tickets.filter((_, k) => k !== i)
  if (tickets.length === 0) return { tickets: [EMPTY_TICKET], open: 0, tau: 0, compare: false }
  const open = s.open > i ? s.open - 1 : Math.min(s.open, tickets.length - 1)
  const compare = s.compare && comparableCount(tickets) >= 2
  return { tickets, open, tau: Math.min(s.tau, maxTau(tickets)), compare }
}

export function showAll(s: Screen2State, shown: boolean): Screen2State {
  const tickets = s.tickets.map((t) => ({ ...t, shown }))
  return { ...s, tickets, compare: s.compare && comparableCount(tickets) >= 2 }
}

/** Reorders the tickets by rank (best first); unranked tickets keep their order at the end. */
export function sortByRank(s: Screen2State, rankOf: (i: number) => number | undefined): Screen2State {
  const order = s.tickets
    .map((t, i) => ({ t, i, rank: rankOf(i) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
  return {
    ...s,
    tickets: order.map((o) => o.t),
    open: Math.max(0, order.findIndex((o) => o.i === s.open)),
  }
}
