import { expect, test } from 'vitest'
import { parseUrlState, serializeUrlState } from './urlState'

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
