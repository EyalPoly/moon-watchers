import { http, HttpResponse } from 'msw'
import { POINT_AREA, formatLatLon, inPointArea, parsePointId, pointId } from '../points'
import type { Horizon, Scenario } from '../types'
import { parseIsoMinute } from '../../time'
import { horizonAtMast, monthSeries, stationOf, syntheticSummary } from './synthetic'

interface SampleSite {
  id: string
  lat_deg: number
  lon_deg: number
  slope_deg: number
}

export interface Samples {
  meta: unknown
  health: unknown
  sites: unknown
  site: Record<string, SampleSite>
  horizon: Record<string, Horizon>
}

const toRad = (deg: number) => (deg * Math.PI) / 180

function angularDistance(a: { lat: number; lon: number }, b: SampleSite): number {
  const [lat1, lat2] = [toRad(a.lat), toRad(b.lat_deg)]
  const dLon = toRad(b.lon_deg - a.lon)
  const cos = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return Math.acos(Math.min(1, Math.max(-1, cos)))
}

function nearestSample(samples: SampleSite[], lat: number | null, lon: number | null): SampleSite {
  if (lat === null || lon === null) return samples[0]
  const from = { lat, lon }
  return samples.reduce((best, s) =>
    angularDistance(from, s) < angularDistance(from, best) ? s : best,
  )
}

function numberParam(url: URL, name: string): number | null {
  const raw = url.searchParams.get(name)
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function clampParam(url: URL, name: string, min: number, max: number, fallback: number): number {
  const v = numberParam(url, name)
  return v === null ? fallback : Math.min(max, Math.max(min, v))
}

const STATIONS: readonly string[] = ['any', 'goldstone', 'madrid', 'canberra', 'custom']

function invalid(detail: string) {
  return HttpResponse.json(
    { type: 'about:blank', title: 'INVALID_PARAM', status: 422, code: 'INVALID_PARAM', detail },
    { status: 422, headers: { 'content-type': 'application/problem+json' } },
  )
}

function scenarioFrom(url: URL, siteId: string): Scenario | string {
  const t0 = url.searchParams.get('t0') ?? ''
  if (parseIsoMinute(t0) === null) return 't0 must be YYYY-MM-DDTHH:MMZ'
  const w = (url.searchParams.get('w') ?? '1,1,1,0').split(',').map(Number)
  if (w.length !== 4 || w.some((x) => !(x >= 0 && x <= 1))) return 'w must be four weights in [0, 1]'
  const station = url.searchParams.get('station') ?? 'any'
  if (!STATIONS.includes(station)) return 'unknown station'
  const lat = numberParam(url, 'station_lat')
  const lon = numberParam(url, 'station_lon')
  const custom = station === 'custom'
  if (custom !== (lat !== null && lon !== null)) return 'station=custom needs station_lat and station_lon, and only then'
  if (custom && (Math.abs(lat as number) > 90 || Math.abs(lon as number) > 180)) return 'station_lat or station_lon out of range'
  return {
    site: siteId,
    t0,
    days: clampParam(url, 'days', 1, 365, 29.53),
    mast: clampParam(url, 'mast', 1, 10, 2),
    w: w as Scenario['w'],
    station: station as Scenario['station'],
    ...(custom ? { station_lat_deg: lat as number, station_lon_deg: lon as number } : {}),
  }
}

/** Sample stand-in for a custom point: the nearest sample site, nudged so points differ. */
function customSite(id: string, at: { lat: number; lon: number }, near: SampleSite) {
  const h = [...id].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7) / 0xffffffff
  return {
    id,
    name: `Point ${formatLatLon(at.lat, at.lon)}`,
    source: 'custom',
    category: 'custom point',
    region: 'south_pole',
    lat_deg: at.lat,
    lon_deg: at.lon,
    elevation_m: Math.round(((near as SampleSite & { elevation_m?: number }).elevation_m ?? 0) + (h - 0.5) * 600),
    slope_deg: Math.round(Math.max(0.5, near.slope_deg + (h - 0.4) * 6) * 10) / 10,
    slope_baseline_m: 240,
    source_url: `sample: built from ${near.id}, the nearest sample site`,
    is_placeholder: true,
  }
}

export function buildHandlers(samples: Samples, origin: string) {
  const ordered = Object.values(samples.site)
  // An unknown site uses the nearest sample site's answer, and says so in a header. A custom
  // point's id carries its coordinates, so it uses the sample nearest to the point.
  const sampleFor = (id: string, url: URL) => {
    if (Object.hasOwn(samples.site, id)) return samples.site[id]
    const point = parsePointId(id)
    return point
      ? nearestSample(ordered, point.lat, point.lon)
      : nearestSample(ordered, numberParam(url, 'lat'), numberParam(url, 'lon'))
  }
  const fallbackHeader = (id: string, used: SampleSite): Record<string, string> =>
    used.id === id ? {} : { 'x-sample-fallback': used.id }

  return [
    http.get(`${origin}/api/v1/meta`, () => HttpResponse.json(samples.meta as Record<string, unknown>)),
    http.get(`${origin}/api/v1/health`, () => HttpResponse.json(samples.health as Record<string, unknown>)),
    http.get(`${origin}/api/v1/sites`, () => HttpResponse.json(samples.sites as Record<string, unknown>)),
    http.post(`${origin}/api/v1/sites/custom`, async ({ request }) => {
      const body = (await request.json().catch(() => null)) as { lat_deg?: unknown; lon_deg?: unknown } | null
      const lat = Number(body?.lat_deg)
      const lon = Number(body?.lon_deg)
      if (typeof body?.lat_deg !== 'number' || typeof body?.lon_deg !== 'number' || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return invalid('lat_deg and lon_deg must be numbers in range')
      }
      if (!inPointArea(lat, lon)) {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: 'OUT_OF_COVERAGE',
            status: 422,
            code: 'OUT_OF_COVERAGE',
            detail: `custom points must lie between ${POINT_AREA.minLat}° and ${POINT_AREA.maxLat}° latitude`,
          },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        )
      }
      const id = pointId(lat, lon)
      const at = parsePointId(id) as { lat: number; lon: number }
      return HttpResponse.json(customSite(id, at, nearestSample(ordered, at.lat, at.lon)))
    }),
    http.get(`${origin}/api/v1/sites/:id`, ({ params, request }) => {
      const id = String(params.id)
      const own = Object.hasOwn(samples.site, id) ? samples.site[id] : undefined
      if (own) return HttpResponse.json(own)
      // A custom point the server doesn't hold is rebuilt from its id (spec §8.2).
      const point = parsePointId(id)
      if (point) return HttpResponse.json(customSite(id, point, nearestSample(ordered, point.lat, point.lon)))
      const url = new URL(request.url)
      const used = nearestSample(ordered, numberParam(url, 'lat'), numberParam(url, 'lon'))
      return HttpResponse.json(used, { headers: { 'x-sample-fallback': used.id } })
    }),
    http.get(`${origin}/api/v1/sites/:id/horizon`, ({ params, request }) => {
      const id = String(params.id)
      const url = new URL(request.url)
      const used = sampleFor(id, url)
      const horizon = horizonAtMast(samples.horizon[used.id], clampParam(url, 'mast', 1, 10, 2))
      return HttpResponse.json({ ...horizon, site_id: id }, { headers: fallbackHeader(id, used) })
    }),
    http.get(`${origin}/api/v1/scenario/series`, ({ request }) => {
      const url = new URL(request.url)
      const id = url.searchParams.get('site') ?? ''
      const scenario = scenarioFrom(url, id)
      if (typeof scenario === 'string') return invalid(scenario)
      const month = url.searchParams.get('month') ?? ''
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return invalid('month must be YYYY-MM')
      const used = sampleFor(id, url)
      const horizon = horizonAtMast(samples.horizon[used.id], scenario.mast)
      return HttpResponse.json(monthSeries(used, horizon, month, stationOf(scenario)), {
        headers: fallbackHeader(id, used),
      })
    }),
    http.get(`${origin}/api/v1/scenario/summary`, ({ request }) => {
      const url = new URL(request.url)
      const id = url.searchParams.get('site') ?? ''
      const scenario = scenarioFrom(url, id)
      if (typeof scenario === 'string') return invalid(scenario)
      const used = sampleFor(id, url)
      const horizon = horizonAtMast(samples.horizon[used.id], scenario.mast)
      const t0 = parseIsoMinute(scenario.t0) as number
      return HttpResponse.json(syntheticSummary(scenario, used, horizon, t0), {
        headers: fallbackHeader(id, used),
      })
    }),
  ]
}
