import createClient from 'openapi-fetch'
import { resolveSource, type AppConfig, type SourceName } from './config'
import type { paths } from './schema'
import type { Horizon, Meta, Scenario, Series, Site, SitesResponse, Summary } from './types'

const REQUEST_TIMEOUT_MS = 8000

/** Scenario as query parameters, always in the same order and rounding (spec §8.1). */
export function scenarioQuery(s: Scenario) {
  return {
    site: s.site,
    t0: s.t0,
    days: Math.round(s.days * 100) / 100,
    mast: Math.round(s.mast * 10) / 10,
    w: s.w.map((x) => x.toFixed(1)).join(','),
    station: s.station,
    ...(s.station === 'custom'
      ? {
          station_lat: Math.round((s.station_lat_deg ?? 0) * 100) / 100,
          station_lon: Math.round((s.station_lon_deg ?? 0) * 100) / 100,
        }
      : {}),
  }
}

export function createApi(config: AppConfig, search: string) {
  const clientFor = (name: SourceName) => {
    const mode = resolveSource(config, name, search)
    return createClient<paths>({
      baseUrl: mode === 'real' ? config.api_base : '',
      fetch: (request) => fetch(new Request(request, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })),
    })
  }

  return {
    async getMeta() {
      const { data, error } = await clientFor('meta').GET('/api/v1/meta')
      if (data === undefined) throw new Error(`meta request failed: ${JSON.stringify(error)}`)
      // openapi-fetch widens fixed-length tuples to number[]; the schema component keeps them
      return data as Meta
    },
    async getSites(): Promise<SitesResponse> {
      const { data, error } = await clientFor('sites').GET('/api/v1/sites')
      if (data === undefined) throw new Error(`sites request failed: ${JSON.stringify(error)}`)
      return data
    },
    async getSite(id: string): Promise<Site> {
      const { data, error } = await clientFor('sites').GET('/api/v1/sites/{site_id}', {
        params: { path: { site_id: id } },
      })
      if (data === undefined) throw new Error(`site request failed: ${JSON.stringify(error)}`)
      return data
    },
    /** Creates (or finds again) a custom point; the answer is a Site whose id encodes it. */
    async createCustomSite(lat: number, lon: number): Promise<Site> {
      const { data, error } = await clientFor('custom').POST('/api/v1/sites/custom', {
        body: { lat_deg: lat, lon_deg: lon },
      })
      if (data === undefined) throw new Error(`custom site request failed: ${JSON.stringify(error)}`)
      return data
    },
    async getHorizon(id: string, mast: number): Promise<Horizon> {
      const { data, error } = await clientFor('horizon').GET('/api/v1/sites/{site_id}/horizon', {
        params: { path: { site_id: id }, query: { mast, part: 'full' } },
      })
      if (data === undefined) throw new Error(`horizon request failed: ${JSON.stringify(error)}`)
      return data
    },
    async getSeries(scenario: Scenario, month: string): Promise<Series> {
      const { data, error } = await clientFor('series').GET('/api/v1/scenario/series', {
        params: { query: { ...scenarioQuery(scenario), month } },
      })
      if (data === undefined) throw new Error(`series request failed: ${JSON.stringify(error)}`)
      return data
    },
    async getSummary(scenario: Scenario): Promise<Summary> {
      const { data, error } = await clientFor('summary').GET('/api/v1/scenario/summary', {
        params: { query: scenarioQuery(scenario) },
      })
      if (data === undefined) throw new Error(`summary request failed: ${JSON.stringify(error)}`)
      return data as Summary
    },
  }
}
