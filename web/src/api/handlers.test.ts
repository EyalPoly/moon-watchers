import { setupServer } from 'msw/node'
import { afterAll, beforeAll, expect, test } from 'vitest'
import health from '@samples/health.json'
import meta from '@samples/meta.json'
import sites from '@samples/sites.json'
import siteA from '@samples/sites/sample_a.json'
import siteB from '@samples/sites/sample_b.json'
import siteC from '@samples/sites/sample_c.json'
import { buildHandlers } from './mocks/handlers'
import { samples } from './mocks/samples'

const siteSamples = { sample_a: siteA, sample_b: siteB, sample_c: siteC }
const server = setupServer(
  ...buildHandlers({ meta, health, sites, site: siteSamples, horizon: samples.horizon }, 'http://localhost'),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterAll(() => server.close())

test('meta ignores the v query parameter', async () => {
  const a = await (await fetch('http://localhost/api/v1/meta?v=abc')).json()
  const b = await (await fetch('http://localhost/api/v1/meta?v=zzz')).json()
  expect(a).toEqual(b)
  expect(a).toEqual(meta)
})

test('health returns the health sample', async () => {
  const body = await (await fetch('http://localhost/api/v1/health')).json()
  expect(body).toEqual(health)
})

test('sites returns the sites sample', async () => {
  const body = await (await fetch('http://localhost/api/v1/sites')).json()
  expect(body).toEqual(sites)
})

test('a known site returns its own sample without a fallback header', async () => {
  const response = await fetch('http://localhost/api/v1/sites/sample_b')
  expect((await response.json()).id).toBe('sample_b')
  expect(response.headers.get('x-sample-fallback')).toBeNull()
})

test('an unknown site falls back to the first sample site', async () => {
  const response = await fetch('http://localhost/api/v1/sites/not_a_sample')
  expect(response.status).toBe(200)
  expect(response.headers.get('x-sample-fallback')).toBe('sample_a')
  expect((await response.json()).id).toBe('sample_a')
})

test('an unknown site with coordinates falls back to the nearest sample site', async () => {
  const response = await fetch(
    `http://localhost/api/v1/sites/not_a_sample?lat=${siteC.lat_deg}&lon=${siteC.lon_deg + 1}`,
  )
  expect(response.headers.get('x-sample-fallback')).toBe('sample_c')
  expect((await response.json()).id).toBe('sample_c')
})

// --- Horizon, series and summary ------------------------------------------------------

const SCENARIO = 't0=2027-03-01T00:00Z&days=30&panel=2&antenna=3&w=1.0,1.0,1.0,0.0&station=29.7604,-95.3698,0,0'

test('horizon returns 720 elevations and blocking distances for a sample site', async () => {
  const response = await fetch('http://localhost/api/v1/sites/sample_b/horizon?mast=2')
  const body = await response.json()
  expect(body.site_id).toBe('sample_b')
  expect(body.elevation_deg).toHaveLength(720)
  expect(body.distance_km).toHaveLength(720)
  expect(response.headers.get('x-sample-fallback')).toBeNull()
})

test('a taller mast lowers the horizon', async () => {
  const low = await (await fetch('http://localhost/api/v1/sites/sample_b/horizon?mast=2')).json()
  const high = await (await fetch('http://localhost/api/v1/sites/sample_b/horizon?mast=10')).json()
  expect(high.mast_m).toBe(10)
  high.elevation_deg.forEach((el: number, i: number) => expect(el).toBeLessThan(low.elevation_deg[i]))
})

test('an unknown site gets the nearest sample horizon, flagged in a header', async () => {
  const response = await fetch('http://localhost/api/v1/sites/custom_x/horizon?lat=-88.4&lon=-121')
  expect(response.headers.get('x-sample-fallback')).toBe('sample_c')
  expect((await response.json()).site_id).toBe('custom_x')
})

test('a series covers its whole month on the 10-minute grid', async () => {
  const body = await (await fetch(`http://localhost/api/v1/scenario/series?site=sample_a&${SCENARIO}&month=2027-02`)).json()
  expect(body.start).toBe('2027-02-01T00:00Z')
  expect(body.step_s).toBe(600)
  expect(body.n).toBe(28 * 144)
  for (const key of ['sun_az', 'sun_el', 'sun_lit_frac', 'earth_el', 'earth_any', 'earth_whole', 'contact', 'station_az', 'station_el', 'station_horizon_el', 'station_moon_el', 'earth_station_up']) {
    expect(body[key]).toHaveLength(body.n)
  }
})

test('summary chips agree with its metrics and the interim thresholds', async () => {
  const body = await (await fetch(`http://localhost/api/v1/scenario/summary?site=sample_a&${SCENARIO}`)).json()
  const color = (pct: number) => (pct >= 60 ? 'green' : pct >= 30 ? 'amber' : 'red')
  expect(body.rag.sun.color).toBe(color(body.metrics.sun_pct))
  expect(body.rag.dte.color).toBe(color(body.metrics.dte_pct))
  // Solar-lander weights: the base is the share of time with both bodies up.
  expect(body.score.base).toBeCloseTo(body.metrics.both_pct, 0)
  expect(body.daily.sun_pct).toHaveLength(30)
  expect(body.scenario.station).toEqual({ lat_deg: 29.7604, lon_deg: -95.3698, alt_m: 0, min_el_deg: 0 })
})

test.each([
  ['t0=2027-03-01', 't0'],
  ['t0=2027-03-01T00:00Z&w=2,1,1,0', 'w'],
  ['t0=2027-03-01T00:00Z&station=houston', 'station'],
  ['t0=2027-03-01T00:00Z&station=1,2,3', 'station'],
  ['t0=2027-03-01T00:00Z&station=95,0,0,0', 'station'],
  ['t0=2027-03-01T00:00Z&panel=2.555', 'panel'],
  ['t0=2027-03-01T00:00Z&antenna=11', 'antenna'],
])('summary rejects %s with a problem+json 422', async (query, word) => {
  const response = await fetch(`http://localhost/api/v1/scenario/summary?site=sample_a&${query}`)
  expect(response.status).toBe(422)
  expect(response.headers.get('content-type')).toContain('application/problem+json')
  expect((await response.json()).detail).toContain(word)
})


// --- Series: the spec's scenario shape ---------------------------------------------------

const SERIES = `http://localhost/api/v1/scenario/series?site=sample_a&t0=2027-03-01T00:00Z&month=2027-03`
const seriesFor = async (query: string) => (await fetch(`${SERIES}&${query}`)).json()
const share = (flags: (boolean | number | null)[]) => flags.filter(Boolean).length / flags.length

test('a station further east or west of Houston is up at other times', async () => {
  const west = await seriesFor('station=31.25,-60,0,0')
  const east = await seriesFor('station=31.25,120,0,0')
  expect(west.earth_station_up).not.toEqual(east.earth_station_up)
})

test('a higher mask means the station is up for less of the month', async () => {
  const flat = await seriesFor('station=29.7604,-95.3698,0,0')
  const masked = await seriesFor('station=29.7604,-95.3698,0,30')
  expect(share(masked.earth_station_up)).toBeLessThan(share(flat.earth_station_up))
  expect(share(flat.earth_station_up)).toBeGreaterThan(0.3)
  expect(share(flat.earth_station_up)).toBeLessThan(0.7)
})

test('contact needs the station up and a clear line over the terrain', async () => {
  const body = await seriesFor('station=40.4314,-4.2481,0,0')
  body.contact.forEach((c: number | null, i: number) => {
    if (c === 1) {
      expect(body.earth_station_up[i]).toBe(true)
      expect(body.station_el[i]).toBeGreaterThan(body.station_horizon_el[i])
    }
  })
  expect(body.earth_vis_el.some((v: number) => v === 90)).toBe(true)
})

test('a higher antenna never reduces contact, and a higher panel lowers the Sun terrain', async () => {
  const low = await seriesFor('antenna=1&panel=1')
  const high = await seriesFor('antenna=10&panel=10')
  expect(share(high.contact)).toBeGreaterThanOrEqual(share(low.contact))
  high.sun_horizon_el.forEach((h: number, i: number) => expect(h).toBeLessThanOrEqual(low.sun_horizon_el[i]))
})

test('heights in centimetres are accepted and echoed by the horizon', async () => {
  expect((await seriesFor('panel=2.55&antenna=2.5')).n).toBe(31 * 144)
  const horizon = await (await fetch('http://localhost/api/v1/sites/sample_b/horizon?mast=2.5')).json()
  expect(horizon.mast_m).toBe(2.5)
})

test.each(['station=1,2,3', 'station=abc', 'station=95,0,0,0', 'station=0,0,0,50', 'panel=2.555', 'panel=0.99', 'antenna=10.01', 'panel='])(
  'series rejects %s',
  async (query) => {
    const response = await fetch(`${SERIES}&${query}`)
    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  },
)

test('unknown terrain in the horizon gives null in every field that reads it', async () => {
  const hole = (h: typeof samples.horizon.sample_c) => ({
    ...h,
    elevation_deg: h.elevation_deg.map((v, i) => (i < 720 ? null : v)),
    distance_km: h.distance_km.map((v, i) => (i < 720 ? null : v)),
  })
  const blind = setupServer(
    ...buildHandlers(
      { meta, health, sites, site: siteSamples, horizon: { ...samples.horizon, sample_c: hole(samples.horizon.sample_c) } },
      'http://blind',
    ),
  )
  blind.listen({ onUnhandledFrame: 'bypass' })
  try {
    const body = await (await fetch(`http://blind/api/v1/scenario/series?site=sample_c&t0=2027-03-01T00:00Z&month=2027-03`)).json()
    for (const key of ['sun_horizon_el', 'sun_lit_frac', 'station_horizon_el', 'earth_horizon_el', 'earth_any', 'earth_whole']) {
      expect(body[key].every((v: unknown) => v === null)).toBe(true)
    }
    expect(body.contact.some((v: unknown) => v === null)).toBe(true)
    // Contact is still 0 where the station is down: a known "no" settles it.
    body.contact.forEach((c: number | null, i: number) => {
      if (!body.earth_station_up[i]) expect(c).toBe(0)
    })
    expect(JSON.stringify(body)).not.toContain('NaN')
  } finally {
    blind.close()
  }
})
