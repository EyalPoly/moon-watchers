import { setupServer } from 'msw/node'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { buildHandlers } from './mocks/handlers'
import { samples } from './mocks/samples'

const server = setupServer(...buildHandlers(samples, 'http://localhost'))
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterAll(() => server.close())

const SERIES = 'http://localhost/api/v1/scenario/series?site=sample_a&t0=2027-03-01T00:00Z&month=2027-03'
const seriesFor = async (station: string) => (await fetch(`${SERIES}&${station}`)).json()

test('all DSN sites cover the Moon all the time; a single station only part of each day', async () => {
  const any = await seriesFor('station=any')
  const madrid = await seriesFor('station=madrid')
  expect(any.earth_station_up.every(Boolean)).toBe(true)
  const upShare = madrid.earth_station_up.filter(Boolean).length / madrid.n
  expect(upShare).toBeGreaterThan(0.3)
  expect(upShare).toBeLessThan(0.7)
  // Contact needs both the station and a clear line over the terrain.
  madrid.earth_visible.forEach((v: boolean, i: number) => {
    if (v) expect(madrid.earth_station_up[i]).toBe(true)
  })
})

test('a custom station by lat/lon shifts contact with its longitude', async () => {
  const west = await seriesFor('station=custom&station_lat=31.25&station_lon=-60')
  const east = await seriesFor('station=custom&station_lat=31.25&station_lon=120')
  expect(west.earth_station_up).not.toEqual(east.earth_station_up)
})

test('a single station lowers Earth contact in the summary', async () => {
  const summary = async (station: string) =>
    (await fetch(`http://localhost/api/v1/scenario/summary?site=sample_a&t0=2027-03-01T00:00Z&${station}`)).json()
  const any = await summary('station=any')
  const madrid = await summary('station=madrid')
  expect(madrid.metrics.dte_pct).toBeLessThan(any.metrics.dte_pct)
  expect(madrid.scenario.station).toBe('madrid')
})

test.each([
  ['station=custom', 'station_lat'],
  ['station=custom&station_lat=10', 'station_lat'],
  ['station=madrid&station_lat=10&station_lon=10', 'station_lat'],
  ['station=custom&station_lat=95&station_lon=10', 'out of range'],
])('series rejects %s', async (query, word) => {
  const response = await fetch(`${SERIES}&${query}`)
  expect(response.status).toBe(422)
  expect((await response.json()).detail).toContain(word)
})
