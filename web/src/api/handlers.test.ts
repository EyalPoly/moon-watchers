import { setupServer } from 'msw/node'
import { afterAll, beforeAll, expect, test } from 'vitest'
import health from '@samples/health.json'
import meta from '@samples/meta.json'
import sites from '@samples/sites.json'
import siteA from '@samples/sites/sample_a.json'
import siteB from '@samples/sites/sample_b.json'
import siteC from '@samples/sites/sample_c.json'
import { buildHandlers } from './mocks/handlers'

const siteSamples = { sample_a: siteA, sample_b: siteB, sample_c: siteC }
const server = setupServer(...buildHandlers({ meta, health, sites, site: siteSamples }))

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
