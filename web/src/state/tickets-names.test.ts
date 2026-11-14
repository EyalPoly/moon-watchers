import { expect, test } from 'vitest'
import { EMPTY_TICKET, addTicketsFor, cleanName, parseScreen2, serializeScreen2, type Screen2State } from './tickets'

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
  const base = { ...EMPTY_TICKET, site: 'sample_a', t0: '2027-06-01T00:00Z', days: 14, station: 'madrid' as const, name: 'Base' }
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
