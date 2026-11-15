import { describe, expect, it } from 'vitest'
import summaryB from '@samples/summary/sample_b.json'
import sitesJson from '@samples/sites.json'
import { SCORE_DEFAULTS } from '../api/scoreSettings'
import type { Site, Summary } from '../api/types'
import { describeAppState } from './appState'
import { GEMINI_RESPONSE_SCHEMA, intentSchema, systemPrompt, type Intent } from './intent'
import { TOPICS, TOPIC_IDS, topicIndex, topicTexts } from './knowledge'
import { adviseScore, describeChanges } from './scoreAdvice'

const site = (sitesJson.sites as Site[]).find((s) => s.id === 'sample_b')!
const intent = (patch: Partial<Intent>): Intent => ({ action: 'set_score', reply: '', ...patch })

describe('knowledge notes', () => {
  it('has a note for every topic, each naming its sources', () => {
    expect(TOPIC_IDS).toEqual(expect.arrayContaining(['score', 'warnings', 'region-tool', 'south-pole-screen', 'visibility', 'metrics']))
    for (const t of TOPICS) {
      expect(t.text.length).toBeGreaterThan(300)
      expect(t.text).toMatch(/^Sources: /m)
    }
  })

  it('documents every weight id and every warning code the app uses', () => {
    const score = TOPICS.find((t) => t.id === 'score')!.text
    for (const id of ['L', 'C', 'DK', 'OT', 'LS', 'S', 'D']) expect(score).toContain(`| ${id} |`)
    const warnings = TOPICS.find((t) => t.id === 'warnings')!.text
    for (const code of ['EXCLUDED_PSR', 'EXCLUDED_SLOPE', 'NULL_GRADE', 'PSR_UNKNOWN', 'DEM_GAPS', 'EARTH_ORIENTATION_PREDICTED', 'CUSTOM_COARSE_TERRAIN']) {
      expect(warnings).toContain(code)
    }
  })

  it('lists the index and returns only known notes', () => {
    expect(topicIndex()).toContain('- score: Score and weights')
    const picked = topicTexts(['warnings', 'nonsense', 'score'])
    expect(picked.ids).toEqual(['score', 'warnings'])
    expect(picked.text).toContain('=== score ===')
    expect(picked.text).not.toContain('nonsense')
  })
})

describe('the guide JSON', () => {
  it('lists the same fields for Gemini and for the check, with every action', () => {
    expect(Object.keys(GEMINI_RESPONSE_SCHEMA.properties).sort()).toEqual(Object.keys(intentSchema.shape).sort())
    expect(GEMINI_RESPONSE_SCHEMA.properties.action.enum).toEqual(['open', 'explore', 'answer', 'ask', 'lookup', 'set_score', 'open_region'])
  })

  it('reads ask options and weights', () => {
    const parsed = intentSchema.parse({ action: 'ask', reply: 'Which month?', options: ['March 2027', 'June 2027'] })
    expect(parsed.options).toEqual(['March 2027', 'June 2027'])
    expect(intentSchema.parse({ action: 'set_score', reply: '', weights: { L: 0.5, C: 0.1 } }).weights).toEqual({ L: 0.5, C: 0.1 })
  })

  it('puts the app state, the mode and the asked-for notes into the prompt', () => {
    const base = {
      sites: [],
      stations: [],
      today: '2026-11-15',
      limits: { firstLanding: '2026-01-01T00:00Z', lastLanding: '2030-12-31T23:50Z', minDays: 1, maxDays: 365, minHeight: 1, maxHeight: 10 },
      defaults: { landing: '2027-03-01T00:00Z', days: 29.53, panel: 2, antenna: 3, station: 'houston' },
      topicIndex: topicIndex(),
      appState: 'Site cards (1): A: Sample site B. Score 20.9',
      mode: 'direct' as const,
    }
    const first = systemPrompt(base)
    expect(first).toContain('APP STATE')
    expect(first).toContain('Score 20.9')
    expect(first).toContain('DIRECT')
    expect(first).not.toContain('REFERENCE NOTES you asked for')
    const second = systemPrompt({ ...base, mode: 'advisor', reference: topicTexts(['score']) })
    expect(second).toContain('ADVISOR')
    expect(second).toContain('REFERENCE NOTES you asked for (score)')
    expect(second).toContain('do not use "lookup" again')
  })
})

describe('adviseScore', () => {
  it('rounds weights to 0.05, keeps the ones not given, and lists the changes', () => {
    const advice = adviseScore(intent({ weights: { L: 0.43, C: 0.1 } }), SCORE_DEFAULTS)
    expect(advice.ok).toBe(true)
    if (!advice.ok) return
    expect(advice.settings.w).toEqual([0.45, 0.1, 0.15, 0.15, 0.1, 0.1, 0])
    expect(advice.settings.sun_req).toBe(SCORE_DEFAULTS.sun_req)
    expect(describeChanges(advice.changes)).toBe('sunlight 0.25 → 0.45, station contact 0.25 → 0.10')
  })

  it('clamps out-of-range weights and accepts a preset by id or name', () => {
    const clamped = adviseScore(intent({ weights: { L: 3, D: -1 } }), SCORE_DEFAULTS)
    expect(clamped.ok && clamped.settings.w[0]).toBe(1)
    const preset = adviseScore(intent({ preset: 'Sunlight first' }), SCORE_DEFAULTS)
    expect(preset.ok && preset.settings.w).toEqual([0.6, 0.2, 0, 0, 0, 0.1, 0.1])
    expect(preset.ok && preset.preset).toBe('Sunlight first')
  })

  it('refuses all-zero weights or a suggestion with none', () => {
    expect(adviseScore(intent({ weights: { L: 0, C: 0, DK: 0, OT: 0, LS: 0, S: 0, D: 0 } }), SCORE_DEFAULTS).ok).toBe(false)
    expect(adviseScore(intent({}), SCORE_DEFAULTS).ok).toBe(false)
  })
})

describe('describeAppState', () => {
  it('gives each site its scenario, score breakdown, chips, metrics and warnings', () => {
    const text = describeAppState({
      screen: 'south_pole',
      explorer: 'map',
      regionToolOpen: false,
      activeLetter: 'A',
      settings: SCORE_DEFAULTS,
      cards: [
        { letter: 'A', name: 'Sample site B', site, t0: '2027-03-01T00:00Z', days: 30, panel: 2, antenna: 3, station: 'Madrid (Spain)', shown: true, summary: summaryB as unknown as Summary, pending: false },
        { letter: 'B', name: 'Site B', site: undefined, t0: '2027-03-01T00:00Z', days: 30, panel: 2, antenna: 3, station: 'Houston', shown: true, summary: undefined, pending: false },
      ],
    })
    expect(text).toContain('Score settings (defaults): weights L 0.25, C 0.25')
    expect(text).toContain('A: Sample site B. catalog site sample_b')
    expect(text).toContain('station Madrid (Spain)')
    expect(text).toMatch(/Score [\d.]+ \/ 100, (red|amber|green)/)
    expect(text).toMatch(/Factors \(raw value, grade 0-1, weight share, points lost\): L sunlight: /)
    expect(text).toContain('Chips: Sun ')
    expect(text).toContain('Metrics: Sun ')
    expect(text).toContain('B: Site B. No location yet (a draft).')
  })
})
