import { expect, test } from 'vitest'
import meta from '@samples/meta.json'
import { HOUSTON, PRESETS, stationFromUrl, stationLabel, stationToUrl } from './stations'

test('the presets are the ones /meta lists, Houston first', () => {
  expect(PRESETS.map((p) => ({ id: p.id, name: p.name, ...p.point }))).toEqual(meta.stations)
  expect(PRESETS[0].point).toEqual(HOUSTON)
})

test('Houston is the default and needs no URL token', () => {
  expect(stationToUrl(HOUSTON)).toBeNull()
})

test('a custom point round-trips through its URL token', () => {
  const p = { lat_deg: 31.25, lon_deg: 34.79, alt_m: 120, min_el_deg: 5 }
  const token = stationToUrl(p)
  expect(token).toBe('31.25,34.79,120,5')
  expect(stationFromUrl(token as string)).toEqual(p)
})

test('old preset ids and old @lat,lon tokens still open', () => {
  expect(stationFromUrl('madrid')).toEqual(PRESETS.find((p) => p.id === 'madrid')?.point)
  expect(stationFromUrl('@31.25,34.79')).toEqual({ lat_deg: 31.25, lon_deg: 34.79, alt_m: 0, min_el_deg: 0 })
})

test.each(['', 'nowhere', '1,2,3', '95,0,0,0', '0,181,0,0', '0,0,-600,0', '0,0,0,50', '0,0,0,nan', '@95,10', '@1,2,3'])(
  'a broken token %j is refused',
  (token) => {
    expect(stationFromUrl(token)).toBeNull()
  },
)

test('labels name a preset, or give the coordinates', () => {
  expect(stationLabel(HOUSTON, PRESETS)).toContain('demonstration location')
  expect(stationLabel({ lat_deg: 31.25, lon_deg: 34.79, alt_m: 0, min_el_deg: 0 }, PRESETS)).toBe('31.25°, 34.79°')
  expect(stationLabel({ lat_deg: 31.25, lon_deg: 34.79, alt_m: 120, min_el_deg: 5 }, PRESETS)).toBe(
    '31.25°, 34.79°, 120 m, mask 5°',
  )
})
