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

const SCENARIO = 't0=2027-03-01T00:00Z&days=29.53&mast=2&w=1.0,1.0,1.0,0.0&station=any'

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
  for (const key of ['sun_az', 'sun_el', 'sun_lit_frac', 'earth_el', 'earth_visible', 'earth_station_up']) {
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
})

test.each([
  ['t0=2027-03-01', 't0'],
  ['t0=2027-03-01T00:00Z&w=2,1,1,0', 'w'],
  ['t0=2027-03-01T00:00Z&station=houston', 'station'],
])('summary rejects %s with a problem+json 422', async (query, word) => {
  const response = await fetch(`http://localhost/api/v1/scenario/summary?site=sample_a&${query}`)
  expect(response.status).toBe(422)
  expect(response.headers.get('content-type')).toContain('application/problem+json')
  expect((await response.json()).detail).toContain(word)
})
