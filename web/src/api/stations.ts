import type { StationPoint } from './types'

export interface StationPreset {
  id: string
  name: string
  point: StationPoint
}

export const HOUSTON: StationPoint = { lat_deg: 29.7604, lon_deg: -95.3698, alt_m: 0, min_el_deg: 0 }

// Same list as /meta, bundled so the picker works while the server is down. Houston is a
// demonstration location: its name says so wherever it is shown.
export const PRESETS: readonly StationPreset[] = [
  { id: 'houston', name: 'Houston (demonstration location, not an operational antenna)', point: HOUSTON },
  { id: 'goldstone', name: 'Goldstone (USA)', point: { lat_deg: 35.4267, lon_deg: -116.89, alt_m: 0, min_el_deg: 0 } },
  { id: 'madrid', name: 'Madrid (Spain)', point: { lat_deg: 40.4314, lon_deg: -4.2481, alt_m: 0, min_el_deg: 0 } },
  { id: 'canberra', name: 'Canberra (Australia)', point: { lat_deg: -35.4014, lon_deg: 148.9819, alt_m: 0, min_el_deg: 0 } },
]

/** The presets as /meta lists them. */
export function presetsFrom(stations: readonly (StationPoint & { id: string; name: string })[]): StationPreset[] {
  return stations.map(({ id, name, lat_deg, lon_deg, alt_m, min_el_deg }) => ({
    id,
    name,
    point: { lat_deg, lon_deg, alt_m, min_el_deg },
  }))
}

const LIMITS = { lat: 90, lon: 180, altMin: -500, altMax: 9000, minEl: 45 }
const NUMBER = /^-?\d+(?:\.\d+)?$/

const round = (v: number, decimals: number) => {
  const k = 10 ** decimals
  return Math.round(v * k) / k
}

export const sameStation = (a: StationPoint, b: StationPoint) =>
  a.lat_deg === b.lat_deg && a.lon_deg === b.lon_deg && a.alt_m === b.alt_m && a.min_el_deg === b.min_el_deg

/** The point if every value is in range, with the precision the app keeps. */
export function normalizeStation(lat: number, lon: number, alt: number, minEl: number): StationPoint | null {
  const ok =
    Math.abs(lat) <= LIMITS.lat &&
    Math.abs(lon) <= LIMITS.lon &&
    alt >= LIMITS.altMin &&
    alt <= LIMITS.altMax &&
    minEl >= 0 &&
    minEl <= LIMITS.minEl
  return ok ? { lat_deg: round(lat, 4), lon_deg: round(lon, 4), alt_m: round(alt, 1), min_el_deg: round(minEl, 1) } : null
}

/** The `station` query value: lat,lon,alt_m,min_el_deg. */
export function stationQuery(p: StationPoint): string {
  return [p.lat_deg, p.lon_deg, p.alt_m, p.min_el_deg].join(',')
}

/** The URL token for a ticket's station; null for Houston, the default. */
export function stationToUrl(p: StationPoint): string | null {
  return sameStation(p, HOUSTON) ? null : stationQuery(p)
}

/** A station from its URL token. Old links name a preset (`madrid`) or give `@lat,lon`. */
export function stationFromUrl(token: string): StationPoint | null {
  const preset = PRESETS.find((p) => p.id === token)
  if (preset) return preset.point
  const legacy = token.startsWith('@')
  const parts = (legacy ? token.slice(1) : token).split(',')
  if (parts.length !== (legacy ? 2 : 4) || !parts.every((p) => NUMBER.test(p))) return null
  const [lat, lon, alt = 0, minEl = 0] = parts.map(Number)
  return normalizeStation(lat, lon, alt, minEl)
}

/** "Madrid (Spain)", or the coordinates of a custom point. */
export function stationLabel(p: StationPoint, presets: readonly StationPreset[] = PRESETS): string {
  const preset = presets.find((s) => sameStation(s.point, p))
  if (preset) return preset.name
  const extra = [p.alt_m !== 0 ? `${p.alt_m} m` : '', p.min_el_deg > 0 ? `mask ${p.min_el_deg}°` : '']
  return [`${p.lat_deg}°`, `${p.lon_deg}°`, ...extra].filter(Boolean).join(', ')
}
