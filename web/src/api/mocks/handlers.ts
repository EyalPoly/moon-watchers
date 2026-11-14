import { http, HttpResponse } from 'msw'

interface SampleSite {
  id: string
  lat_deg: number
  lon_deg: number
}

export interface Samples {
  meta: unknown
  health: unknown
  sites: unknown
  site: Record<string, SampleSite>
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

export function buildHandlers(samples: Samples, origin: string) {
  const ordered = Object.values(samples.site)
  return [
    http.get(`${origin}/api/v1/meta`, () => HttpResponse.json(samples.meta as Record<string, unknown>)),
    http.get(`${origin}/api/v1/health`, () => HttpResponse.json(samples.health as Record<string, unknown>)),
    http.get(`${origin}/api/v1/sites`, () => HttpResponse.json(samples.sites as Record<string, unknown>)),
    http.get(`${origin}/api/v1/sites/:id`, ({ params, request }) => {
      const id = String(params.id)
      const own = Object.hasOwn(samples.site, id) ? samples.site[id] : undefined
      if (own) return HttpResponse.json(own)
      const url = new URL(request.url)
      const used = nearestSample(ordered, numberParam(url, 'lat'), numberParam(url, 'lon'))
      return HttpResponse.json(used, { headers: { 'x-sample-fallback': used.id } })
    }),
  ]
}
