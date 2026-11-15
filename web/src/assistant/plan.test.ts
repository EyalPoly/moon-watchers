import { describe, expect, it } from 'vitest'
import sitesJson from '@samples/sites.json'
import { PRESETS } from '../api/stations'
import type { Site } from '../api/types'
import { EMPTY_TICKET, MAX_URL_TICKETS, parseScreen2, serializeScreen2, type Screen2State } from '../state/tickets'
import { GEMINI_RESPONSE_SCHEMA, intentSchema, systemPrompt, type Intent } from './intent'
import { applyPlan, describePlan, intentToPlan, parseLanding, type Plan } from './plan'

const catalog = sitesJson.sites as Site[]
const ctx = { catalog, stations: PRESETS }
const intent = (patch: Partial<Intent>): Intent => ({ action: 'open', reply: '', ...patch })
const opened = (plan: Plan) => {
  if (plan.kind !== 'open') throw new Error(`expected open, got none: ${plan.notes.join(' ')}`)
  return plan
}
const fresh: Screen2State = parseScreen2('')

describe('intent schema', () => {
  it('lists the same fields for Gemini and for the check', () => {
    expect(Object.keys(GEMINI_RESPONSE_SCHEMA.properties).sort()).toEqual(Object.keys(intentSchema.shape).sort())
    expect(GEMINI_RESPONSE_SCHEMA.propertyOrdering.slice().sort()).toEqual(Object.keys(intentSchema.shape).sort())
  })

  it('rejects an unknown action', () => {
    expect(intentSchema.safeParse({ action: 'delete', reply: '' }).success).toBe(false)
  })

  it('gives the model the catalog ids and station ids', () => {
    const text = systemPrompt({
      sites: catalog,
      stations: PRESETS,
      today: '2026-11-15',
      limits: { firstLanding: '2026-01-01T00:00Z', lastLanding: '2030-12-31T23:50Z', minDays: 1, maxDays: 365, minHeight: 1, maxHeight: 10 },
      defaults: { landing: '2027-03-01T00:00Z', days: 29.53, panel: 2, antenna: 3, station: 'houston' },
      topicIndex: '- score: Score and weights (the 7 grades)',
      appState: 'Site cards (1): A: Mons Mouton.',
      mode: 'advisor',
    })
    for (const s of catalog) expect(text).toContain(`- ${s.id}: ${s.name}`)
    expect(text).toContain('- madrid: Madrid (Spain)')
    expect(text).toContain('Today is 2026-11-15')
  })
})

describe('parseLanding', () => {
  it('reads a date or a UTC time and puts it on the 10-minute grid', () => {
    expect(parseLanding('2027-03-01')).toBe('2027-03-01T00:00Z')
    expect(parseLanding('2027-06-15T13:47Z')).toBe('2027-06-15T13:40Z')
    expect(parseLanding('2027-06-15T13:47:30Z')).toBe('2027-06-15T13:40Z')
  })

  it('refuses dates outside the mission range or that do not exist', () => {
    expect(parseLanding('2035-01-01')).toBeNull()
    expect(parseLanding('2027-02-30')).toBeNull()
    expect(parseLanding('next March')).toBeNull()
  })
})

describe('intentToPlan', () => {
  it('opens a catalog site by id, or by a loosely written name', () => {
    expect(opened(intentToPlan(intent({ points: [{ site_id: 'sample_a' }] }), ctx)).points).toEqual([
      { site: 'sample_a', label: 'Sample site A', custom: false },
    ])
    expect(opened(intentToPlan(intent({ points: [{ site_id: 'Sample site B' }] }), ctx)).points[0].site).toBe('sample_b')
  })

  it('opens a typed location as a custom point, west longitudes counted round from 360°', () => {
    const plan = opened(intentToPlan(intent({ points: [{ lat_deg: -87.5, lon_deg: 45 }, { lat_deg: -88, lon_deg: -90 }] }), ctx))
    expect(plan.points.map((p) => p.site)).toEqual(['pt_s87500_e045000', 'pt_s88000_e270000'])
    expect(plan.points.every((p) => p.custom)).toBe(true)
  })

  it('does not open a location outside the south-pole area, and says why', () => {
    const plan = intentToPlan(intent({ points: [{ lat_deg: -80, lon_deg: 0 }] }), ctx)
    expect(plan.kind).toBe('none')
    expect(plan.notes.join()).toMatch(/outside the south-pole area/)
  })

  it('skips an unknown site but opens the rest', () => {
    const plan = opened(intentToPlan(intent({ points: [{ site_id: 'shackleton' }, { site_id: 'sample_c' }] }), ctx))
    expect(plan.points.map((p) => p.site)).toEqual(['sample_c'])
    expect(plan.notes).toEqual(['There is no catalog site called "shackleton".'])
  })

  it('opens each catalog site once for a request with no place', () => {
    const plan = opened(intentToPlan(intent({ action: 'explore', days: 120, landing: '2027-03-01' }), ctx))
    expect(plan.points.map((p) => p.site)).toEqual(catalog.map((s) => s.id))
    expect(plan.settings.days).toBe(120)
  })

  it('opens nothing for an answer, and reads an old "none" as an answer', () => {
    expect(intentToPlan(intent({ action: 'answer', reply: 'Hello' }), ctx)).toEqual({ kind: 'none', notes: [] })
    expect(intentSchema.parse({ action: 'none', reply: 'Hi' }).action).toBe('answer')
  })

  it('keeps values in range and falls back, with a note, for the rest', () => {
    const plan = opened(
      intentToPlan(intent({ points: [{ site_id: 'sample_a' }], days: 400, panel_m: 2.345, antenna_m: 25, landing: '2040-01-01', station_id: 'madrid' }), ctx),
    )
    expect(plan.settings).toEqual({
      t0: EMPTY_TICKET.t0,
      days: EMPTY_TICKET.days,
      panel: 2.35,
      antenna: EMPTY_TICKET.antenna,
      station: PRESETS.find((p) => p.id === 'madrid')!.point,
    })
    expect(plan.notes).toHaveLength(3)
  })

  it('uses Houston when the station is unknown', () => {
    const plan = opened(intentToPlan(intent({ points: [{ site_id: 'sample_a' }], station_id: 'jerusalem' }), ctx))
    expect(plan.settings.station).toEqual(EMPTY_TICKET.station)
    expect(plan.notes[0]).toMatch(/no Earth station called "jerusalem"/)
  })
})

describe('applyPlan', () => {
  const plan = opened(intentToPlan(intent({ action: 'explore', days: 14, name: 'Survey' }), ctx))

  it('replaces the empty starting draft', () => {
    const r = applyPlan(fresh, plan)
    expect(r.first).toBe(0)
    expect(r.count).toBe(3)
    expect(r.state.tickets.map((t) => t.site)).toEqual(['sample_a', 'sample_b', 'sample_c'])
    expect(r.state.tickets.map((t) => t.name)).toEqual(['Survey · Sample site A', 'Survey · Sample site B', 'Survey · Sample site C'])
    expect(r.state.tickets.every((t) => t.days === 14 && t.shown && !t.editing)).toBe(true)
    expect(r.state.open).toBe(0)
  })

  it('adds after the sites already there and opens the first new one', () => {
    const start = parseScreen2('?tk=sample_b~2027-03-01T00:00Z~29.53~2~3')
    const r = applyPlan(start, opened(intentToPlan(intent({ points: [{ site_id: 'sample_a' }], name: 'Plan B' }), ctx)))
    expect(r.first).toBe(1)
    expect(r.state.tickets.map((t) => t.site)).toEqual(['sample_b', 'sample_a'])
    expect(r.state.tickets[1].name).toBe('Plan B')
    expect(r.state.open).toBe(1)
    // It survives the trip through the URL.
    expect(parseScreen2(serializeScreen2(r.state)).tickets[1]).toMatchObject({ site: 'sample_a', name: 'Plan B' })
  })

  it('never goes past the URL limit', () => {
    const full = { ...fresh, tickets: Array.from({ length: MAX_URL_TICKETS - 1 }, () => ({ ...EMPTY_TICKET, site: 'sample_a' })) }
    const r = applyPlan(full, plan)
    expect(r.count).toBe(1)
    expect(r.state.tickets).toHaveLength(MAX_URL_TICKETS)
  })
})

describe('describePlan', () => {
  it('says what opened from the checked values', () => {
    const plan = opened(intentToPlan(intent({ points: [{ lat_deg: -87.5, lon_deg: 45 }], days: 14, station_id: 'madrid' }), ctx))
    const text = describePlan(plan, ctx, ['B'], true)
    expect(text).toContain('Opened site B 87.500°S 45.000°E.')
    expect(text).toContain('14 days on the Moon')
    expect(text).toContain('Madrid.')
    expect(text).toContain('Typed locations use sample data')
  })
})
