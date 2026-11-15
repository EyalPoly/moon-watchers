import { expect, test, vi } from 'vitest'
import { AREA_CONCURRENCY, areaCells, insidePolygon, MAX_AREA_CELLS, rankAreas, TooManyCellsError } from './areas'
import type { LatLon } from './points'

const MOON_RADIUS_M = 1737400

// A small square near 87.5°S, 0°E: about 20 km on a side.
const square = [
  { lat: -87.2, lon: -5 },
  { lat: -87.2, lon: 5 },
  { lat: -87.8, lon: 5 },
  { lat: -87.8, lon: -5 },
]

/** A square centered on the pole whose sides are `2 * halfKm` long in the map projection. */
function poleSquare(halfKm: number): LatLon[] {
  const colatitudeDeg = ((2 * Math.atan((halfKm * 1000) / (2 * MOON_RADIUS_M))) * 180) / Math.PI
  // Vertices on the axes would be the square's edge midpoints; corners sit on the diagonals,
  // which the stereographic map keeps straight along meridians.
  const cornerColat = colatitudeDeg * Math.SQRT2
  const lat = -90 + cornerColat
  return [45, 135, 225, 315].map((lon) => ({ lat, lon }))
}

const byLat = async (c: LatLon) => 100 + c.lat

test('areaCells keeps the cells whose center is inside the outline, once each', () => {
  const cells = areaCells(square, 5)
  expect(cells.length).toBeGreaterThan(3)
  expect(new Set(cells.map((c) => c.id)).size).toBe(cells.length)
  for (const c of cells) {
    expect(c.center.lat).toBeGreaterThan(-87.85)
    expect(c.center.lat).toBeLessThan(-87.15)
    expect(c.corners).toHaveLength(4)
  }
  expect(areaCells(square, 5)).toEqual(cells)
})

test('fewer than three points is not an area', () => {
  expect(areaCells(square.slice(0, 2), 5)).toEqual([])
})

test('rankAreas ranks 1..n, best grade first', async () => {
  const result = await rankAreas({ polygon: square, spacingKm: 5, grade: byLat })
  expect(result.cells).toBe(areaCells(square, 5).length)
  expect(result.failed).toBe(0)
  expect(result.firstFailure).toBeNull()
  expect(result.areas.map((a) => a.rank)).toEqual(result.areas.map((_, i) => i + 1))
  for (let i = 1; i < result.areas.length; i++) {
    expect(result.areas[i - 1].grade).toBeGreaterThanOrEqual(result.areas[i].grade)
  }
})

test('exactly 16 cells run; more are refused before any grading', async () => {
  expect(MAX_AREA_CELLS).toBe(16)
  // Cell centers sit at odd multiples of 2.5 km around the pole, so a 20 km square holds 4 x 4.
  const sixteen = poleSquare(10)
  expect(areaCells(sixteen, 5)).toHaveLength(16)
  await expect(rankAreas({ polygon: sixteen, spacingKm: 5, grade: byLat })).resolves.toMatchObject({ cells: 16 })

  const grade = vi.fn(byLat)
  const thirtySix = poleSquare(15)
  expect(areaCells(thirtySix, 5)).toHaveLength(36)
  const error = await rankAreas({ polygon: thirtySix, spacingKm: 5, grade }).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(TooManyCellsError)
  expect(error).toMatchObject({ count: 36, max: 16 })
  expect(grade).not.toHaveBeenCalled()
})

test('grading runs two cells at a time', async () => {
  let inFlight = 0
  let peak = 0
  const grade = async (c: LatLon) => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight--
    return 100 + c.lat
  }
  await rankAreas({ polygon: square, spacingKm: 5, grade })
  expect(AREA_CONCURRENCY).toBe(2)
  expect(peak).toBe(2)
})

test('a cell that fails is counted and the rest are still ranked', async () => {
  const cells = areaCells(square, 5)
  const bad = cells[1].center
  const grade = async (c: LatLon) => {
    if (c.lat === bad.lat && c.lon === bad.lon) throw new Error('rate limited')
    return 100 + c.lat
  }
  const result = await rankAreas({ polygon: square, spacingKm: 5, grade })
  expect(result.failed).toBe(1)
  expect(result.firstFailure).toBe('rate limited')
  expect(result.cells).toBe(cells.length)
  expect(result.areas).toHaveLength(cells.length - 1)
})

test('when every cell fails the error is thrown, not an empty list', async () => {
  const grade = async () => {
    throw new Error('boom')
  }
  await expect(rankAreas({ polygon: square, spacingKm: 5, grade })).rejects.toThrow('boom')
})

test('progress is reported once per cell, ending at the total', async () => {
  const onProgress = vi.fn()
  const { cells } = await rankAreas({ polygon: square, spacingKm: 5, grade: byLat, onProgress })
  expect(onProgress).toHaveBeenCalledTimes(cells)
  expect(onProgress).toHaveBeenLastCalledWith(cells, cells)
})

test('an outline too small for the grid has no cells and makes no requests', async () => {
  const tiny = [
    { lat: -87.5, lon: 0 },
    { lat: -87.5, lon: 0.1 },
    { lat: -87.51, lon: 0.1 },
  ]
  const grade = vi.fn(byLat)
  expect(await rankAreas({ polygon: tiny, spacingKm: 10, grade })).toEqual({
    areas: [],
    cells: 0,
    failed: 0,
    firstFailure: null,
  })
  expect(grade).not.toHaveBeenCalled()
})

test('point-in-polygon follows the even-odd rule', () => {
  const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]
  expect(insidePolygon(5, 5, sq)).toBe(true)
  expect(insidePolygon(15, 5, sq)).toBe(false)
})
