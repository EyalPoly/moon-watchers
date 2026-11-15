// Custom points: a site the user places by latitude and longitude. Its id encodes the point
// to 0.001°, so the same point always gets the same id, links stay short, and the server
// can rebuild a point it no longer has (spec §8.2: POST /sites/custom is idempotent).
//
//   pt_s87500_e045000  =  87.500°S, 45.000°E
//
// Lunar longitude is east-positive, 0 to less than 360°, so ids carry no west letter.

/** The custom-point area of the south_pole region (meta: regions[0].custom_area). */
export const POINT_AREA = { minLat: -90, maxLat: -84 }

const ID = /^pt_([ns])(\d{1,5})_e(\d{1,6})$/

export interface LatLon {
  lat: number
  lon: number
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

/** Lunar longitude in [0, 360): 360° is 0°, and a negative value counts around from 360°. */
export function wrapLon(lon: number): number {
  const v = round3(((lon % 360) + 360) % 360)
  return v >= 360 ? 0 : v
}

export function inPointArea(lat: number, lon: number): boolean {
  return lat >= POINT_AREA.minLat && lat <= POINT_AREA.maxLat && lon >= 0 && lon <= 360
}

export function pointId(lat: number, lon: number): string {
  const a = Math.round(Math.abs(lat) * 1000)
  const b = Math.round(wrapLon(lon) * 1000)
  return `pt_${lat < 0 ? 's' : 'n'}${a}_e${String(b).padStart(6, '0')}`
}

export function parsePointId(id: string): LatLon | null {
  const m = ID.exec(id)
  if (!m) return null
  const lat = (m[1] === 's' ? -1 : 1) * (Number(m[2]) / 1000)
  const lon = Number(m[3]) / 1000
  return inPointArea(lat, lon) ? { lat, lon } : null
}

export function isPointId(id: string): boolean {
  return parsePointId(id) !== null
}

export function formatLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} ${wrapLon(lon).toFixed(3)}°E`
}
