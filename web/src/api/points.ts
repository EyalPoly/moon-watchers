// Custom points: a site the user places by latitude and longitude. Its id encodes the point
// to 0.001°, so the same point always gets the same id, links stay short, and the server
// can rebuild a point it no longer has (spec §8.2: POST /sites/custom is idempotent).
//
//   pt_s87500_e045000  =  87.500°S, 45.000°E

/** The custom-point area of the south_pole region (meta: regions[0].custom_area). */
export const POINT_AREA = { minLat: -90, maxLat: -84 }

const ID = /^pt_([ns])(\d{1,5})_([ew])(\d{1,6})$/

export interface LatLon {
  lat: number
  lon: number
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

export function inPointArea(lat: number, lon: number): boolean {
  return lat >= POINT_AREA.minLat && lat <= POINT_AREA.maxLat && lon >= -180 && lon <= 180
}

export function pointId(lat: number, lon: number): string {
  // Longitude is east-positive in [−180, 180) (spec §12.2); 180°E is written as 180°W.
  const lonN = round3(lon) >= 180 ? round3(lon) - 360 : round3(lon)
  const a = Math.round(Math.abs(lat) * 1000)
  const b = Math.round(Math.abs(lonN) * 1000)
  return `pt_${lat < 0 ? 's' : 'n'}${a}_${lonN < 0 ? 'w' : 'e'}${String(b).padStart(6, '0')}`
}

export function parsePointId(id: string): LatLon | null {
  const m = ID.exec(id)
  if (!m) return null
  const lat = (m[1] === 's' ? -1 : 1) * (Number(m[2]) / 1000)
  const lon = (m[3] === 'w' ? -1 : 1) * (Number(m[4]) / 1000)
  return inPointArea(lat, lon) ? { lat, lon } : null
}

export function isPointId(id: string): boolean {
  return parsePointId(id) !== null
}

export function formatLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}`
}
