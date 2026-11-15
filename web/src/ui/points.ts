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

/** "044.20° E": east-positive, 0 to less than 360. */
export function formatLon(lon: number): string {
  return `${(((lon % 360) + 360) % 360).toFixed(2).padStart(6, '0')}° E`
}

/**
 * Reads "88.75° S", "-88.75", "88.75S" or "044.20° E". The hemisphere letter sets the sign;
 * without one, the number's own sign is used. Lunar longitude is east-positive, 0 to 360 (360
 * reads as 0): a west letter or a negative value is rejected, not converted. Returns null for anything else.
 */
export function parseCoord(text: string, axis: 'lat' | 'lon'): number | null {
  const m = /^\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEWnsew])?\s*$/.exec(text)
  if (!m) return null
  let v = Number(m[1])
  const h = m[2]?.toUpperCase()
  if (h) {
    if ((axis === 'lat' && !'NS'.includes(h)) || (axis === 'lon' && h !== 'E')) return null
    v = Math.abs(v) * (h === 'S' ? -1 : 1)
  }
  if (axis === 'lon') return Number.isFinite(v) && v >= 0 && v <= 360 ? v % 360 : null
  return Number.isFinite(v) && Math.abs(v) <= 90 ? v : null
}
