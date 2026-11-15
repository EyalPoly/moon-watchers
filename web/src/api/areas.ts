// Best areas inside a polygon: covers the polygon the user outlined with grid cells, grades
// each cell through the `grade` function it is given, and returns them best first.

import proj4 from 'proj4'
import type { LatLon } from './points'

/** The south_pole region's projection (meta sample: regions[0].proj4). */
const SOUTH_POLE = '+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs'

/** The server computes a new point in 1-2 s and allows 20 new points a minute per client. */
export const MAX_AREA_CELLS = 16
/** The server runs two heavy computations at once. */
export const AREA_CONCURRENCY = 2

export interface AreaCell {
  /** Stable for the same polygon and grid, e.g. "c12_-7". */
  id: string
  center: LatLon
  /** The cell's four corners, counter-clockwise. */
  corners: LatLon[]
}

export interface RankedArea extends AreaCell {
  /** 1 is the best. */
  rank: number
  /** 0–100, higher is better. */
  grade: number
}

export interface AreaResult {
  areas: RankedArea[]
  /** Cells attempted. */
  cells: number
  failed: number
  firstFailure: string | null
}

export class TooManyCellsError extends Error {
  readonly count: number
  readonly max: number
  constructor(count: number, max: number) {
    super(`${count} grid cells is more than the ${max} that can be graded at once`)
    this.name = 'TooManyCellsError'
    this.count = count
    this.max = max
  }
}

const toXY = (p: LatLon) => proj4('EPSG:4326', SOUTH_POLE, [p.lon, p.lat]) as [number, number]
const toLatLon = ([x, y]: [number, number]): LatLon => {
  const [lon, lat] = proj4(SOUTH_POLE, 'EPSG:4326', [x, y]) as [number, number]
  return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round((((lon % 360) + 360) % 360) * 1e5) / 1e5 }
}
// A point's id has 0.001° precision, so the center is rounded the same way before grading.
const roundCenter = (p: LatLon): LatLon => ({ lat: Math.round(p.lat * 1000) / 1000, lon: Math.round(p.lon * 1000) / 1000 })

/** Even-odd rule: is (x, y) inside the polygon? */
export function insidePolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Each cell is one grid square; it counts when its center is inside the outline. */
export function areaCells(polygon: LatLon[], spacingKm: number): AreaCell[] {
  if (polygon.length < 3) return []
  const s = spacingKm * 1000
  const poly = polygon.map(toXY)
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const seen = new Set<string>()
  const cells: AreaCell[] = []
  for (let i = Math.floor(Math.min(...xs) / s); i < Math.ceil(Math.max(...xs) / s); i++) {
    for (let j = Math.floor(Math.min(...ys) / s); j < Math.ceil(Math.max(...ys) / s); j++) {
      const cx = (i + 0.5) * s
      const cy = (j + 0.5) * s
      if (!insidePolygon(cx, cy, poly)) continue
      const center = roundCenter(toLatLon([cx, cy]))
      const key = `${center.lat},${center.lon}`
      if (seen.has(key)) continue
      seen.add(key)
      cells.push({
        id: `c${i}_${j}`,
        center,
        corners: [
          toLatLon([i * s, j * s]),
          toLatLon([(i + 1) * s, j * s]),
          toLatLon([(i + 1) * s, (j + 1) * s]),
          toLatLon([i * s, (j + 1) * s]),
        ],
      })
    }
  }
  return cells.sort((a, b) => a.id.localeCompare(b.id))
}

export interface AreaRequest {
  /** The outline, as grid points in order (at least 3). */
  polygon: LatLon[]
  /** Grid spacing, which is also the size of each area. */
  spacingKm: number
  grade: (center: LatLon) => Promise<number>
  onProgress?: (done: number, total: number) => void
  /** Stops taking new cells once aborted; the call then rejects with an AbortError. */
  signal?: AbortSignal
}

export async function rankAreas({ polygon, spacingKm, grade, onProgress, signal }: AreaRequest): Promise<AreaResult> {
  const cells = areaCells(polygon, spacingKm)
  if (cells.length > MAX_AREA_CELLS) throw new TooManyCellsError(cells.length, MAX_AREA_CELLS)

  const graded: (AreaCell & { grade: number })[] = []
  let failed = 0
  let firstFailure: string | null = null
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < cells.length && !signal?.aborted) {
      const cell = cells[next++]
      try {
        graded.push({ ...cell, grade: await grade(cell.center) })
      } catch (error) {
        failed++
        firstFailure ??= error instanceof Error ? error.message : String(error)
      }
      onProgress?.(++done, cells.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(AREA_CONCURRENCY, cells.length) }, worker))

  if (signal?.aborted) throw new DOMException('grading was cancelled', 'AbortError')
  if (cells.length > 0 && graded.length === 0) throw new Error(firstFailure ?? 'no cell could be graded')
  const areas = graded
    .sort((a, b) => b.grade - a.grade || a.id.localeCompare(b.id))
    .map((c, k) => ({ ...c, rank: k + 1 }))
  return { areas, cells: cells.length, failed, firstFailure }
}
