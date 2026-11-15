// How points (tickets) are named and described in the UI design.

import type { Site } from '../api/types'

/** A, B, … Z, then AA, AB, … like spreadsheet columns. */
export function pointLetter(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** "SITE 02" for the second catalog site, "CUSTOM" for a point typed or placed by the user. */
export function siteTag(site: Site | undefined, catalog: readonly Site[]): string {
  if (!site) return 'DRAFT'
  if (site.source === 'custom') return 'CUSTOM'
  const i = catalog.findIndex((s) => s.id === site.id)
  return i < 0 ? 'SITE' : `SITE ${String(i + 1).padStart(2, '0')}`
}

/** Retain catalog and user names while labeling generated coordinates as a site. */
export function siteDisplayName(site: Site | undefined): string | undefined {
  return site?.source === 'custom' ? site.name.replace(/^Point (?=\d)/, 'Site ') : site?.name
}

export type Tone = 'good' | 'mid' | 'bad' | 'none'

export function slopeWord(deg: number): { word: string; tone: Tone } {
  if (deg <= 5) return { word: 'Gentle', tone: 'good' }
  if (deg <= 10) return { word: 'Moderate', tone: 'mid' }
  return { word: 'Steep', tone: 'bad' }
}

/** "88.75° S" */
export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'}`
}

/** "044.20° E" */
export function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(2).padStart(6, '0')}° ${lon < 0 ? 'W' : 'E'}`
}

/**
 * Reads "88.75° S", "-88.75", "88.75S" or "044.20° E". The hemisphere letter sets the sign;
 * without one, the number's own sign is used. Returns null for anything else.
 */
export function parseCoord(text: string, axis: 'lat' | 'lon'): number | null {
  const m = /^\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEWnsew])?\s*$/.exec(text)
  if (!m) return null
  let v = Number(m[1])
  const h = m[2]?.toUpperCase()
  if (h) {
    if ((axis === 'lat' && !'NS'.includes(h)) || (axis === 'lon' && !'EW'.includes(h))) return null
    v = Math.abs(v) * (h === 'S' || h === 'W' ? -1 : 1)
  }
  const limit = axis === 'lat' ? 90 : 180
  return Number.isFinite(v) && Math.abs(v) <= limit ? v : null
}
