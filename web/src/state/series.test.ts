import { expect, test } from 'vitest'
import { samples } from '../api/mocks/samples'
import { monthSeries, syntheticSeries } from '../api/mocks/synthetic'
import { parseIsoMinute } from '../time'
import { contactAt, indexAt, liveStatus, nextChange, seriesTimeAt, stitchSeries, sunVisible } from './series'

const site = samples.site.sample_a
const horizon = samples.horizon.sample_a

test('stitching consecutive months gives one continuous series', () => {
  const mar = monthSeries(site, horizon, '2027-03')
  const apr = monthSeries(site, horizon, '2027-04')
  const both = stitchSeries([mar, apr])
  expect(both.n).toBe(mar.n + apr.n)
  expect(both.sun_el.length).toBe(both.n)
  expect(both.contact.length).toBe(both.n)
  expect(both.station_el.length).toBe(both.n)
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

test('live status reads the Sun clearance as elevation minus terrain', () => {
  const s = monthSeries(site, horizon, '2027-03')
  const live = liveStatus(s, 100)
  expect(live.sun.clearance).toBeCloseTo((s.sun_el[100] as number) - (s.sun_horizon_el[100] as number), 6)
})

test('the Earth row reads the station direction: its clearance is station elevation minus its terrain', () => {
  const s = monthSeries(site, horizon, '2027-03')
  const live = liveStatus(s, 100)
  expect(live.earth.az).toBe(s.station_az[100])
  expect(live.earth.el).toBe(s.station_el[100])
  expect(live.earth.horizon).toBe(s.station_horizon_el[100])
  expect(live.earth.clearance).toBeCloseTo((s.station_el[100] as number) - (s.station_horizon_el[100] as number), 6)
  expect(live.earth.visible).toBe(s.contact[100] === null ? null : s.contact[100] === 1)
  expect(live.earth.stationUp).toBe(s.earth_station_up[100])
})

test('an unknown skyline value reads as unknown, never as hidden', () => {
  const s = monthSeries(site, horizon, '2027-03')
  s.sun_lit_frac[5] = null
  s.sun_horizon_el[5] = null
  s.contact[5] = null
  s.station_horizon_el[5] = null
  expect(sunVisible(s, 5)).toBeNull()
  expect(contactAt(s, 5)).toBeNull()
  const live = liveStatus(s, 5)
  expect(live.sun).toMatchObject({ visible: null, horizon: null, clearance: null, litFraction: null })
  expect(live.earth).toMatchObject({ visible: null, horizon: null, clearance: null })
})

test('a change from visible to unknown is an event', () => {
  const s = monthSeries(site, horizon, '2027-03')
  s.sun_lit_frac[0] = 1
  s.sun_lit_frac[1] = 1
  s.sun_lit_frac[2] = null
  s.sun_lit_frac[3] = null
  s.sun_lit_frac[4] = 0.5
  const change = nextChange(s, 0, sunVisible)
  expect(change).toEqual({ kind: 'at', ms: seriesTimeAt(s, 2), inMs: 2 * 600_000 })
  const after = nextChange(s, 2, sunVisible)
  expect(after).toMatchObject({ kind: 'at', ms: seriesTimeAt(s, 4) })
})
