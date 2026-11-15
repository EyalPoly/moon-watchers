import { expect, test } from 'vitest'
import { HOUSTON, PRESETS } from '../api/stations'
import {
  EMPTY_TICKET,
  MAX_URL_TICKETS,
  addTicket,
  comparableCount,
  parseScreen2,
  removeTicket,
  serializeScreen2,
  showAll,
  sortByGrade,
  updateTicket,
  type Screen2State,
} from './tickets'

const A = { ...EMPTY_TICKET, site: 'sample_a' }
const B = {
  ...EMPTY_TICKET,
  site: 'sample_b',
  t0: '2027-06-01T00:00Z',
  days: 14,
  panel: 3,
  antenna: 4.5,
  view: 'graph' as const,
  shown: false,
  station: PRESETS[2].point,
}
const C = { ...EMPTY_TICKET, site: 'sample_c', station: { lat_deg: 31.25, lon_deg: 34.79, alt_m: 100, min_el_deg: 5 } }

test('a fresh start is one empty ticket and an empty URL', () => {
  const s = parseScreen2('')
  expect(s).toEqual({ tickets: [EMPTY_TICKET], open: 0, tau: 0, compare: false })
  expect(serializeScreen2(s)).toBe('')
})

test('tickets round-trip through the URL, flags and stations included', () => {
  const s: Screen2State = { tickets: [A, B, C], open: 1, tau: 60, compare: false }
  const url = serializeScreen2(s, '?data=sample')
  expect(decodeURIComponent(url)).toBe(
    '?data=sample&tk=sample_a~2027-03-01T00:00Z~29.53~2~3' +
      '&tk=sample_b~2027-06-01T00:00Z~14~3~4.5~g~h~s:40.4314,-4.2481,0,0' +
      '&tk=sample_c~2027-03-01T00:00Z~29.53~2~3~s:31.25,34.79,100,5&open=1&tau=60',
  )
  expect(parseScreen2(url)).toEqual(s)
})

test('an old one-site link opens as a single ticket', () => {
  expect(parseScreen2('?site=sample_b&t0=2027-06-01T00:00Z&mast=3').tickets).toEqual([
    { ...EMPTY_TICKET, site: 'sample_b', t0: '2027-06-01T00:00Z', panel: 3 },
  ])
})

test('an old ticket link with one mast height opens with panel 2, antenna 3 and Houston', () => {
  const [t] = parseScreen2('?tk=sample_a~2027-03-01T00:00Z~29.53~2').tickets
  expect(t).toEqual({ ...EMPTY_TICKET, site: 'sample_a' })
  expect(t.station).toEqual(HOUSTON)
})

test('old station flags open as the preset and as a custom point at altitude 0 and mask 0°', () => {
  const link = (flag: string) => `?tk=sample_a~2027-03-01T00:00Z~29.53~2~${flag}`
  expect(parseScreen2(link('s:madrid')).tickets[0].station).toEqual(PRESETS[2].point)
  expect(parseScreen2(link('s:@31.25,34.79')).tickets[0].station).toEqual({
    lat_deg: 31.25,
    lon_deg: 34.79,
    alt_m: 0,
    min_el_deg: 0,
  })
})

test('an old link keeps its flags when it has no antenna height', () => {
  const [t] = parseScreen2('?tk=sample_a~2027-03-01T00:00Z~29.53~2~g~h~n:Plan%20B').tickets
  expect(t).toMatchObject({ view: 'graph', shown: false, name: 'Plan B', panel: 2, antenna: 3 })
})

test('heights round to the nearest centimetre and are written without trailing zeros', () => {
  const [t] = parseScreen2('?tk=sample_a~2027-03-01T00:00Z~29.53~2.555~2.5').tickets
  expect(t.panel).toBe(2.56)
  expect(t.antenna).toBe(2.5)
  const url = serializeScreen2({ tickets: [t], open: 0, tau: 0, compare: false })
  expect(decodeURIComponent(url)).toContain('~29.53~2.56~2.5')
})

test.each([
  ['?tk=..%2Fx~2027-02-30T00:00Z~0~99~zz', { ...EMPTY_TICKET }],
  ['?tk=sample_c~garbage~abc~-1', { ...EMPTY_TICKET, site: 'sample_c' }],
  ['?tk=~~~~', { ...EMPTY_TICKET }],
  ['?tk=~~~~s:houston', { ...EMPTY_TICKET }],
  ['?tk=~~~~s:nowhere', { ...EMPTY_TICKET }],
  ['?tk=~~~~s:@95,10', { ...EMPTY_TICKET }],
  ['?tk=~~~~s:@1,2,3', { ...EMPTY_TICKET }],
  ['?tk=~~~~s:0,0,0,50', { ...EMPTY_TICKET }],
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

test('sorting by grade puts the highest first, keeps ungraded last and follows the open ticket', () => {
  const s: Screen2State = { tickets: [A, B, C, EMPTY_TICKET], open: 2, tau: 0, compare: false }
  const grades = new Map<string | null, number>([['sample_a', 40], ['sample_b', 90], ['sample_c', 65]])
  const sorted = sortByGrade(s, (t) => grades.get(t.site))
  expect(sorted.tickets.map((t) => t.site)).toEqual(['sample_b', 'sample_c', 'sample_a', null])
  expect(sorted.tickets[sorted.open].site).toBe('sample_c')
})
