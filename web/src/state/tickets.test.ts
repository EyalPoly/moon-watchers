import { expect, test } from 'vitest'
import {
  EMPTY_TICKET,
  MAX_URL_TICKETS,
  addTicket,
  comparableCount,
  parseScreen2,
  removeTicket,
  serializeScreen2,
  showAll,
  sortByRank,
  updateTicket,
  type Screen2State,
} from './tickets'

const A = { ...EMPTY_TICKET, site: 'sample_a' }
const B = {
  ...EMPTY_TICKET,
  site: 'sample_b',
  t0: '2027-06-01T00:00Z',
  days: 14,
  mast: 3,
  view: 'graph' as const,
  shown: false,
  station: 'madrid' as const,
}
const C = { ...EMPTY_TICKET, site: 'sample_c', station: 'custom' as const, lat: 31.25, lon: 34.79 }

test('a fresh start is one empty ticket and an empty URL', () => {
  const s = parseScreen2('')
  expect(s).toEqual({ tickets: [EMPTY_TICKET], open: 0, tau: 0, compare: false })
  expect(serializeScreen2(s)).toBe('')
})

test('tickets round-trip through the URL, flags and stations included', () => {
  const s: Screen2State = { tickets: [A, B, C], open: 1, tau: 60, compare: false }
  const url = serializeScreen2(s, '?data=sample')
  expect(decodeURIComponent(url)).toBe(
    '?data=sample&tk=sample_a~2027-03-01T00:00Z~29.53~2&tk=sample_b~2027-06-01T00:00Z~14~3~g~h~s:madrid' +
      '&tk=sample_c~2027-03-01T00:00Z~29.53~2~s:@31.25,34.79&open=1&tau=60',
  )
  expect(parseScreen2(url)).toEqual(s)
})

test('an old one-site link opens as a single ticket', () => {
  expect(parseScreen2('?site=sample_b&t0=2027-06-01T00:00Z&mast=3').tickets).toEqual([
    { ...EMPTY_TICKET, site: 'sample_b', t0: '2027-06-01T00:00Z', mast: 3 },
  ])
})

test.each([
  ['?tk=..%2Fx~2027-02-30T00:00Z~0~99~zz', { ...EMPTY_TICKET }],
  ['?tk=sample_c~garbage~abc~-1', { ...EMPTY_TICKET, site: 'sample_c' }],
  ['?tk=~~~~', { ...EMPTY_TICKET }],
  ['?tk=~~~~s:houston', { ...EMPTY_TICKET }],
  ['?tk=~~~~s:@95,10', { ...EMPTY_TICKET }],
  ['?tk=~~~~s:@1,2,3', { ...EMPTY_TICKET }],
])('broken ticket fields %j fall back to defaults', (search, ticket) => {
  expect(parseScreen2(search).tickets).toEqual([ticket])
})

test('there is no ticket limit, but a link cannot create more than the safety cap', () => {
  let s: Screen2State = { tickets: [A], open: 0, tau: 0, compare: false }
  for (let k = 0; k < 9; k++) s = addTicket(s)
  expect(s.tickets).toHaveLength(10)
  const huge = '?' + Array.from({ length: 80 }, () => 'tk=sample_a').join('&')
  expect(parseScreen2(huge).tickets).toHaveLength(MAX_URL_TICKETS)
})

test('a bad open index, bad tau and a lone compare are ignored', () => {
  const s = parseScreen2('?tk=sample_a&tk=sample_b&open=7&tau=abc')
  expect(s.open).toBe(0)
  expect(s.tau).toBe(0)
  expect(parseScreen2('?tk=sample_a&tk=~2027-03-01T00:00Z&view=compare').compare).toBe(false)
  // A hidden ticket does not count toward comparing.
  expect(parseScreen2('?tk=sample_a&tk=sample_b~2027-03-01T00:00Z~29.53~2~h&view=compare').compare).toBe(false)
})

test('tau stays inside the longest mission', () => {
  expect(parseScreen2('?tk=sample_a~2027-03-01T00:00Z~7~2&tau=999999').tau).toBe(7 * 1440)
  const s = updateTicket({ tickets: [A], open: 0, tau: 20_000, compare: false }, 0, { days: 7 })
  expect(s.tau).toBe(7 * 1440)
})

test('a new ticket copies the open one without its site, shows, and opens', () => {
  const s = addTicket({ tickets: [B], open: 0, tau: 0, compare: false })
  expect(s.tickets[1]).toEqual({ ...B, site: null, view: 'map', shown: true })
  expect(s.open).toBe(1)
})

test('removing tickets keeps the open one pointing at the same ticket, and never leaves none', () => {
  const s: Screen2State = { tickets: [A, { ...B, shown: true }, C], open: 2, tau: 0, compare: true }
  const after = removeTicket(s, 0)
  expect(after.tickets.map((t) => t.site)).toEqual(['sample_b', 'sample_c'])
  expect(after.open).toBe(1)
  expect(after.compare).toBe(true)
  const last = removeTicket({ tickets: [A], open: 0, tau: 50, compare: false }, 0)
  expect(last).toEqual({ tickets: [EMPTY_TICKET], open: 0, tau: 0, compare: false })
})

test('hiding tickets leaves compare once fewer than two remain', () => {
  const s: Screen2State = { tickets: [A, { ...B, shown: true }], open: 0, tau: 0, compare: true }
  expect(comparableCount(s.tickets)).toBe(2)
  expect(updateTicket(s, 1, { shown: false }).compare).toBe(false)
  expect(showAll(s, false).tickets.every((t) => !t.shown)).toBe(true)
})

test('sorting by rank puts the best first, keeps unranked last and follows the open ticket', () => {
  const s: Screen2State = { tickets: [A, B, C, EMPTY_TICKET], open: 2, tau: 0, compare: false }
  const ranks = [3, 1, 2, undefined]
  const sorted = sortByRank(s, (i) => ranks[i])
  expect(sorted.tickets.map((t) => t.site)).toEqual(['sample_b', 'sample_c', 'sample_a', null])
  expect(sorted.tickets[sorted.open].site).toBe('sample_c')
})
