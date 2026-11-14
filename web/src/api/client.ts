import createClient from 'openapi-fetch'
import { resolveSource, type AppConfig, type SourceName } from './config'
import type { paths } from './schema'

export function createApi(config: AppConfig, search: string) {
  const clientFor = (name: SourceName) => {
    const mode = resolveSource(config, name, search)
    return createClient<paths>({ baseUrl: mode === 'real' ? config.api_base : '' })
  }

  return {
    async getMeta() {
      const { data, error } = await clientFor('meta').GET('/api/v1/meta')
      if (data === undefined) throw new Error(`meta request failed: ${JSON.stringify(error)}`)
      return data
    },
  }
}
