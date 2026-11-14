import { expect, test, vi } from 'vitest'
import { HOUSTON } from './stations'
import { rankTickets, type RankInput } from './ranking'

const base: Omit<RankInput, 'key' | 'site'> = {
  t0: '2027-03-01T00:00Z',
  days: 29.53,
  panel: 2,
  antenna: 3,
  station: HOUSTON,
}
const site = (id: string, elevation_m: number, slope_deg: number) => ({ id, lat_deg: -87, lon_deg: 0, elevation_m, slope_deg })

test('returns every ticket once, sorted best first, with ranks 1..n', async () => {
  vi.useFakeTimers()
  const pending = rankTickets([
    { ...base, key: 'flat_high', site: site('a', 1500, 1) },
    { ...base, key: 'steep_low', site: site('b', -400, 12) },
    { ...base, key: 'middle', site: site('c', 300, 5) },
  ])
  await vi.runAllTimersAsync()
  const ranked = await pending
  vi.useRealTimers()
  expect(ranked.map((r) => r.key)).toEqual(['flat_high', 'middle', 'steep_low'])
  expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3])
  for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].grade).toBeGreaterThanOrEqual(ranked[i].grade)
  ranked.forEach((r) => expect(r.grade).toBeGreaterThanOrEqual(0))
})

test('an empty list ranks to an empty list', async () => {
  expect(await rankTickets([])).toEqual([])
})
