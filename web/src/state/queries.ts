import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createApi } from '../api/client'
import { resolveSource, type AppConfig } from '../api/config'

export function useSites(config: AppConfig, search: string) {
  const mode = resolveSource(config, 'sites', search)
  return useQuery({
    queryKey: ['sites', mode, mode === 'real' ? config.api_base : ''],
    queryFn: () => createApi(config, search).getSites(),
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useSite(config: AppConfig, search: string, id: string | null) {
  const mode = resolveSource(config, 'sites', search)
  return useQuery({
    queryKey: ['site', mode, mode === 'real' ? config.api_base : '', id],
    queryFn: () => createApi(config, search).getSite(id as string),
    enabled: id !== null,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useMeta(config: AppConfig, search: string) {
  const mode = resolveSource(config, 'meta', search)
  return useQuery({
    queryKey: ['meta', mode, mode === 'real' ? config.api_base : ''],
    queryFn: () => createApi(config, search).getMeta(),
    retry: false,
  })
}
