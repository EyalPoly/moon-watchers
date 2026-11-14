import { expect, test } from 'vitest'
import { insidePolygon, rankAreas } from './areas'

// A small square near 87.5°S, 0°E: about 20 km on a side.
const square = [
  { lat: -87.2, lon: -5 },
  { lat: -87.2, lon: 5 },
  { lat: -87.8, lon: 5 },
  { lat: -87.8, lon: -5 },
]

test('returns cells inside the polygon, best first, ranked 1..n', async () => {
  const areas = await rankAreas({ polygon: square, spacingKm: 5 })
  expect(areas.length).toBeGreaterThan(3)
  expect(areas.map((a) => a.rank)).toEqual(areas.map((_, i) => i + 1))
  for (let i = 1; i < areas.length; i++) expect(areas[i - 1].grade).toBeGreaterThanOrEqual(areas[i].grade)
  for (const a of areas) {
    expect(a.center.lat).toBeGreaterThan(-87.85)
    expect(a.center.lat).toBeLessThan(-87.15)
    expect(a.corners).toHaveLength(4)
  }
})

test('the same outline gives the same areas, and the limit caps them', async () => {
  const a = await rankAreas({ polygon: square, spacingKm: 2, limit: 5 })
  const b = await rankAreas({ polygon: square, spacingKm: 2, limit: 5 })
  expect(a).toHaveLength(5)
  expect(a).toEqual(b)
})

test('fewer than three points is not an area', async () => {
  expect(await rankAreas({ polygon: square.slice(0, 2), spacingKm: 5 })).toEqual([])
})

test('point-in-polygon follows the even-odd rule', () => {
  const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]
  expect(insidePolygon(5, 5, sq)).toBe(true)
  expect(insidePolygon(15, 5, sq)).toBe(false)
})
