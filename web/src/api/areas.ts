// Best areas inside a polygon: takes the polygon the user outlined on the map grid and
// returns the grid cells inside it, graded and sorted, best first.
//
// DUMMY. The real function does not exist yet. This one has the same inputs and outputs, so
// swapping it for the real call (most likely a server endpoint) changes only this file. Its
// grades are made up: closer to the pole is better, plus smooth fake "terrain" variation.

import proj4 from 'proj4'
import type { LatLon } from './points'

/** The south_pole region's projection (meta sample: regions[0].proj4). */
const SOUTH_POLE = '+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs'

export interface RankedArea {
  /** Stable for the same polygon and grid, e.g. "c12_-7". */
  id: string
  /** 1 is the best. */
  rank: number
  /** 0–100, higher is better. */
  grade: number
  center: LatLon
  /** The cell's four corners, counter-clockwise. */
  corners: LatLon[]
}

export interface AreaRequest {
  /** The outline, as grid points in order (at least 3). */
  polygon: LatLon[]
  /** Grid spacing, which is also the size of each area. */
  spacingKm: number
  /** How many areas to return at most. */
  limit?: number
}

const toXY = (p: LatLon) => proj4('EPSG:4326', SOUTH_POLE, [p.lon, p.lat]) as [number, number]
const toLatLon = ([x, y]: [number, number]): LatLon => {
  const [lon, lat] = proj4(SOUTH_POLE, 'EPSG:4326', [x, y]) as [number, number]
  return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 }
}

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

function dummyGrade(x: number, y: number): number {
  const rhoKm = Math.hypot(x, y) / 1000
  const terrain = 12 * Math.sin(x / 9000) * Math.cos(y / 7000) + 6 * Math.sin((x + y) / 4000)
  return Math.round(Math.min(100, Math.max(0, 85 - rhoKm * 0.25 + terrain)) * 10) / 10
}

export async function rankAreas({ polygon, spacingKm, limit = 12 }: AreaRequest): Promise<RankedArea[]> {
  await new Promise((resolve) => setTimeout(resolve, 250)) // like a network call
  if (polygon.length < 3) return []
  const s = spacingKm * 1000
  const poly = polygon.map(toXY)
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const cells: Omit<RankedArea, 'rank'>[] = []
  // Each area is one grid cell; it counts when its center is inside the outline.
  for (let i = Math.floor(Math.min(...xs) / s); i < Math.ceil(Math.max(...xs) / s); i++) {
    for (let j = Math.floor(Math.min(...ys) / s); j < Math.ceil(Math.max(...ys) / s); j++) {
      const cx = (i + 0.5) * s
      const cy = (j + 0.5) * s
      if (!insidePolygon(cx, cy, poly)) continue
      cells.push({
        id: `c${i}_${j}`,
        grade: dummyGrade(cx, cy),
        center: toLatLon([cx, cy]),
        corners: [
          toLatLon([i * s, j * s]),
          toLatLon([(i + 1) * s, j * s]),
          toLatLon([(i + 1) * s, (j + 1) * s]),
          toLatLon([i * s, (j + 1) * s]),
        ],
      })
    }
  }
  return cells
    .sort((a, b) => b.grade - a.grade || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((c, k) => ({ ...c, rank: k + 1 }))
}
