import { transform } from 'ol/proj'
import { expect, test } from 'vitest'
import meta from '@samples/meta.json'
import type { Region } from '../api/types'
import { registerRegionProjection } from './projection'

const region = meta.regions[0] as Region

test('the pole maps to the origin', () => {
  const crs = registerRegionProjection(region).getCode()
  const [x, y] = transform([0, -90], 'EPSG:4326', crs)
  expect(Math.hypot(x, y)).toBeLessThan(1)
})

test('89 degrees south is 30,324 m from the origin', () => {
  const crs = registerRegionProjection(region).getCode()
  const [x, y] = transform([0, -89], 'EPSG:4326', crs)
  expect(Math.abs(Math.hypot(x, y) - 30324)).toBeLessThan(2)
})

test('transforming back round-trips within 1e-6 degrees', () => {
  const crs = registerRegionProjection(region).getCode()
  const [lon, lat] = transform(transform([37.5, -86.25], 'EPSG:4326', crs), crs, 'EPSG:4326')
  expect(Math.abs(lon - 37.5)).toBeLessThan(1e-6)
  expect(Math.abs(lat + 86.25)).toBeLessThan(1e-6)
})
