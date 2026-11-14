import { expect, test } from 'vitest'
import { MISSION_DEFAULTS, parseMission, parseUrlState, serializeMission, serializeUrlState } from './urlState'

const known = ['sample_a', 'sample_b', 'sample_c']

test('a known site parses', () => {
  expect(parseUrlState('?site=sample_b', known)).toEqual({ site: 'sample_b' })
})

test.each(['?site=nonexistent', '?site=', '?site=%00', '?foo=bar', '', '?site=sample_a&site=x', '?site=../x'])(
  'garbage %j falls back to no site',
  (search) => {
    const state = parseUrlState(search, known)
    expect(state.site === null || known.includes(state.site)).toBe(true)
    if (search !== '?site=sample_a&site=x') expect(state).toEqual({ site: null })
  },
)

test('serialize and parse round-trip', () => {
  expect(parseUrlState(serializeUrlState({ site: 'sample_c' }), known)).toEqual({ site: 'sample_c' })
  expect(serializeUrlState({ site: null })).toBe('')
})

test('serialize keeps unrelated parameters', () => {
  expect(serializeUrlState({ site: 'sample_a' }, '?data=sample')).toBe('?data=sample&site=sample_a')
  expect(serializeUrlState({ site: null }, '?data=sample&site=sample_a')).toBe('?data=sample')
})

// --- Mission parameters ---------------------------------------------------------------


test('an empty URL gives the mission defaults', () => {
  expect(parseMission('')).toEqual(MISSION_DEFAULTS)
})

test.each([
  '?t0=2027-02-30T00:00Z',
  '?t0=2025-12-31T23:50Z',
  '?t0=2031-01-01T00:00Z',
  '?t0=2027-03-01T00:05Z',
  '?t0=garbage',
  '?days=0',
  '?days=400',
  '?days=abc',
  '?mast=0',
  '?mast=99',
  '?tau=-10',
])('garbage %j falls back to defaults', (search) => {
  expect(parseMission(search)).toEqual(MISSION_DEFAULTS)
})

test('values are rounded to their steps and tau stays inside the mission', () => {
  expect(parseMission('?mast=2.7&tau=1234&days=14')).toEqual({
    ...MISSION_DEFAULTS,
    days: 14,
    mast: 2.5,
    tau: 1230,
  })
  expect(parseMission('?days=7&tau=99999').tau).toBe(7 * 1440)
})

test('serialize writes only non-defaults, in a fixed order, and keeps other parameters', () => {
  expect(serializeMission(MISSION_DEFAULTS)).toBe('')
  const state = { t0: '2027-06-01T00:00Z', days: 14, mast: 3, tau: 60 }
  expect(serializeMission(state, '?site=sample_a&data=sample')).toBe(
    '?site=sample_a&data=sample&t0=2027-06-01T00%3A00Z&days=14&mast=3&tau=60',
  )
  expect(parseMission(serializeMission(state))).toEqual(state)
})
