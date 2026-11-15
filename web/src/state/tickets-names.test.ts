import { expect, test } from 'vitest'
import { PRESETS } from '../api/stations'
import { EMPTY_TICKET, MAX_URL_TICKETS, addTicketsFor, cleanName, parseScreen2, placePoint, serializeScreen2, type Screen2State } from './tickets'

test('ticket names round-trip through the URL', () => {
  const s: Screen2State = {
    tickets: [{ ...EMPTY_TICKET, site: 'sample_a', name: 'Shackleton rim, plan B' }],
    open: 0,
    tau: 0,
    compare: false,
  }
  expect(parseScreen2(serializeScreen2(s))).toEqual(s)
})

test('names lose the URL separator, extra spaces and anything past 40 characters', () => {
  expect(cleanName('  a~b   c  ')).toBe('a-b c')
  expect(cleanName('x'.repeat(60))).toHaveLength(40)
  expect(parseScreen2('?tk=sample_a~2027-03-01T00:00Z~29.53~2~n:%20%20').tickets[0].name).toBe('')
})

test('a custom point id is a valid ticket site', () => {
  expect(parseScreen2('?tk=pt_s87500_e045000').tickets[0].site).toBe('pt_s87500_e045000')
})

test('tickets for picked areas copy the source ticket and open the first new one', () => {
  const base = { ...EMPTY_TICKET, site: 'sample_a', t0: '2027-06-01T00:00Z', days: 14, station: PRESETS[2].point, name: 'Base' }
  const s = addTicketsFor({ tickets: [base], open: 0, tau: 0, compare: false }, 0, [
    { site: 'pt_s87000_e010000', name: 'Area #1' },
    { site: 'pt_s87100_e010000', name: 'Area #2' },
  ])
  expect(s.tickets).toHaveLength(3)
  expect(s.open).toBe(1)
  expect(s.tickets[1]).toEqual({ ...base, site: 'pt_s87000_e010000', name: 'Area #1', view: 'map', shown: true })
})

test('all cards can be collapsed (open = -1), and that survives the URL', () => {
  const s: Screen2State = { tickets: [{ ...EMPTY_TICKET, site: 'sample_a' }], open: -1, tau: 0, compare: false }
  expect(parseScreen2(serializeScreen2(s)).open).toBe(-1)
  expect(parseScreen2('?tk=sample_a&open=-2').open).toBe(0)
})

const PLACED = 'pt_s87000_e010000'

test('placing on a blank active card fills it and shows results', () => {
  const s: Screen2State = { tickets: [{ ...EMPTY_TICKET }], open: 0, tau: 0, compare: false }
  const next = placePoint(s, 0, PLACED)
  expect(next.tickets).toHaveLength(1)
  expect(next.tickets[0].site).toBe(PLACED)
  expect(next.tickets[0].editing).toBeUndefined()
  expect(next.open).toBe(0)
})

test('placing with a site already set adds a card that copies the active one', () => {
  const base = { ...EMPTY_TICKET, site: 'sample_a', t0: '2027-06-01T00:00Z', days: 14, station: PRESETS[2].point }
  const next = placePoint({ tickets: [base], open: 0, tau: 0, compare: false }, 0, PLACED)
  expect(next.tickets).toHaveLength(2)
  expect(next.tickets[1]).toEqual({ ...base, site: PLACED, name: '', view: 'map', shown: true })
  expect(next.open).toBe(1)
  expect(next.compare).toBe(false)
})

test('placing at the card limit changes nothing', () => {
  const s: Screen2State = {
    tickets: Array.from({ length: MAX_URL_TICKETS }, () => ({ ...EMPTY_TICKET, site: 'sample_a' })),
    open: 0,
    tau: 0,
    compare: false,
  }
  expect(placePoint(s, 0, PLACED)).toBe(s)
})

test('placing while the active card is collapsed still opens the new card', () => {
  const base = { ...EMPTY_TICKET, site: 'sample_a', collapsed: true }
  const next = placePoint({ tickets: [base], open: 0, tau: 0, compare: false }, 0, PLACED)
  expect(next.tickets[1].collapsed).toBeUndefined()
  expect(next.open).toBe(1)
})

test('at the card limit a blank active card can still be filled', () => {
  const tickets = Array.from({ length: MAX_URL_TICKETS }, () => ({ ...EMPTY_TICKET, site: 'sample_a' }))
  tickets[MAX_URL_TICKETS - 1] = { ...EMPTY_TICKET }
  const next = placePoint({ tickets, open: MAX_URL_TICKETS - 1, tau: 0, compare: false }, MAX_URL_TICKETS - 1, PLACED)
  expect(next.tickets).toHaveLength(MAX_URL_TICKETS)
  expect(next.tickets[MAX_URL_TICKETS - 1].site).toBe(PLACED)
})
