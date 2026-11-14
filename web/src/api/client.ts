import createClient from 'openapi-fetch'
import { resolveSource, type AppConfig, type SourceName } from './config'
import type { paths } from './schema'
import type { Meta, Site, SitesResponse } from './types'

export function createApi(config: AppConfig, search: string) {
  const clientFor = (name: SourceName) => {
    const mode = resolveSource(config, name, search)
    return createClient<paths>({ baseUrl: mode === 'real' ? config.api_base : '' })
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
  }
}
