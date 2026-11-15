import { useMemo } from 'react'
import { keepPreviousData, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { createApi } from '../api/client'
import { resolveSource, type AppConfig } from '../api/config'
import type { Scenario, Series } from '../api/types'
import { DAY_MS, monthsBetween, parseIsoMinute } from '../time'
import { stitchSeries } from './series'
import { parsePointId, type LatLon } from '../api/points'

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

export function useHorizon(config: AppConfig, search: string, id: string | null, mast: number) {
  const mode = resolveSource(config, 'horizon', search)
  return useQuery({
    queryKey: ['horizon', mode, mode === 'real' ? config.api_base : '', id, mast],
    queryFn: () => createApi(config, search).getHorizon(id as string, mast),
    enabled: id !== null,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useSummary(config: AppConfig, search: string, scenario: Scenario | null) {
  const mode = resolveSource(config, 'summary', search)
  return useQuery({
    queryKey: ['summary', mode, mode === 'real' ? config.api_base : '', scenario],
    queryFn: () => createApi(config, search).getSummary(scenario as Scenario),
    enabled: scenario !== null,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/** Every month the mission touches, stitched into one series (spec §9.2 "Reading the series"). */
export function useMissionSeries(config: AppConfig, search: string, scenario: Scenario | null, onlyMonth?: string) {
  const mode = resolveSource(config, 'series', search)
  const months = useMemo(() => {
    if (scenario === null) return []
    if (onlyMonth) return [onlyMonth]
    const t0 = parseIsoMinute(scenario.t0)
    return t0 === null ? [] : monthsBetween(t0, t0 + scenario.days * DAY_MS)
  }, [scenario, onlyMonth])
  return useQueries({
    queries: months.map((month) => ({
      // The month's series depends on the site, heights and station only, so it stays cached
      // while the landing date or mission length changes.
      queryKey: [
        'series',
        mode,
        mode === 'real' ? config.api_base : '',
        scenario?.site,
        scenario?.panel,
        scenario?.antenna,
        scenario?.station,
        month,
      ],
      queryFn: () => createApi(config, search).getSeries(scenario as Scenario, month),
      retry: false,
      staleTime: Infinity,
    })),
    combine: combineSeries,
  })
}

// Module-level so TanStack Query can memoize it: stitching a long mission is not free.
function combineSeries(results: UseQueryResult<Series>[]) {
  return {
    data: results.length > 0 && results.every((r) => r.data) ? stitchSeries(results.map((r) => r.data as Series)) : null,
    isError: results.some((r) => r.isError),
    isPending: results.some((r) => r.isPending),
    refetch: () => results.forEach((r) => void r.refetch()),
  }
}

/** One summary per scenario, for the compare view. Entries stay in scenario order. */
export function useSummaries(config: AppConfig, search: string, scenarios: Scenario[]) {
  const mode = resolveSource(config, 'summary', search)
  return useQueries({
    queries: scenarios.map((scenario) => ({
      queryKey: ['summary', mode, mode === 'real' ? config.api_base : '', scenario],
      queryFn: () => createApi(config, search).getSummary(scenario),
      retry: false,
    })),
  })
}

/** The site for each custom point id (ids encode the point, so this is a stable lookup). */
export function useCustomSites(config: AppConfig, search: string, ids: readonly string[]) {
  const mode = resolveSource(config, 'custom', search)
  return useQueries({
    queries: ids.map((id) => {
      const point = parsePointId(id) as LatLon
      return {
        queryKey: ['custom-site', mode, mode === 'real' ? config.api_base : '', id],
        queryFn: () => createApi(config, search).createCustomSite(point.lat, point.lon),
        retry: false,
        staleTime: Infinity,
      }
    }),
  })
}
