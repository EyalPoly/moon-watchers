import { expect, test } from 'vitest'
import { samples } from '../api/mocks/samples'
import { monthSeries, syntheticSeries } from '../api/mocks/synthetic'
import { parseIsoMinute } from '../time'
import { indexAt, liveStatus, nextChange, seriesTimeAt, stitchSeries, sunVisible } from './series'

const site = samples.site.sample_a
const horizon = samples.horizon.sample_a

test('stitching consecutive months gives one continuous series', () => {
  const mar = monthSeries(site, horizon, '2027-03')
  const apr = monthSeries(site, horizon, '2027-04')
  const both = stitchSeries([mar, apr])
  expect(both.n).toBe(mar.n + apr.n)
  expect(both.sun_el.length).toBe(both.n)
  expect(both.earth_visible.length).toBe(both.n)
  const firstOfApril = indexAt(both, parseIsoMinute('2027-04-01T00:00Z') as number) as number
  expect(both.sun_el[firstOfApril]).toBe(apr.sun_el[0])
})

test('indexAt is null outside the series', () => {
  const s = monthSeries(site, horizon, '2027-03')
  expect(indexAt(s, parseIsoMinute('2027-02-28T23:50Z') as number)).toBeNull()
  expect(indexAt(s, parseIsoMinute('2027-04-01T00:00Z') as number)).toBeNull()
  expect(indexAt(s, parseIsoMinute('2027-03-01T00:10Z') as number)).toBe(1)
})

test('the next change is the first step where the flag flips', () => {
  const s = monthSeries(site, horizon, '2027-03')
  const change = nextChange(s, 0, sunVisible)
  expect(change.kind).toBe('at')
  if (change.kind !== 'at') return
  const j = indexAt(s, change.ms) as number
  expect(sunVisible(s, j)).not.toBe(sunVisible(s, 0))
  for (let k = 1; k < j; k++) expect(sunVisible(s, k)).toBe(sunVisible(s, 0))
})

test('a change past the loaded data reads "not before" the end of the data', () => {
  // A crater floor where the Sun never clears the walls in this short stretch.
  const s = syntheticSeries(samples.site.sample_b, samples.horizon.sample_b, parseIsoMinute('2027-03-01T00:00Z') as number, 30)
  const change = nextChange(s, 0, () => true)
  expect(change).toEqual({ kind: 'not-before', ms: seriesTimeAt(s, s.n) })
})

test('live status reads clearance as elevation minus terrain', () => {
  const s = monthSeries(site, horizon, '2027-03')
  const live = liveStatus(s, 100)
  expect(live.sun.clearance).toBeCloseTo(s.sun_el[100] - s.sun_horizon_el[100], 6)
  expect(live.earth.visible).toBe(s.earth_visible[100])
})
