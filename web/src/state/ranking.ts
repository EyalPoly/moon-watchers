import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { RANK_REFRESH_MS, rankTickets, type RankInput } from '../api/ranking'
import type { Site } from '../api/types'
import type { Ticket } from './tickets'

export interface TicketRank {
  rank: number
  grade: number
  best: boolean
}

/** Ranks the tickets that have a site; refreshes when they change and every 15 s. */
export function useTicketRanking(tickets: readonly Ticket[], sitesById: ReadonlyMap<string, Site>) {
  const inputs = useMemo<RankInput[]>(
    () =>
      tickets.flatMap((t, i) => {
        const site = t.site === null ? undefined : sitesById.get(t.site)
        if (!site) return []
        return [
          {
            key: String(i),
            site: { id: site.id, lat_deg: site.lat_deg, lon_deg: site.lon_deg, elevation_m: site.elevation_m, slope_deg: site.slope_deg },
            t0: t.t0,
            days: t.days,
            panel: t.panel,
            antenna: t.antenna,
            station: t.station,
          },
        ]
      }),
    [tickets, sitesById],
  )
  const query = useQuery({
    queryKey: ['ranking', inputs],
    queryFn: () => rankTickets(inputs),
    enabled: inputs.length > 0,
    refetchInterval: RANK_REFRESH_MS,
    placeholderData: keepPreviousData,
  })
  const byIndex = useMemo(() => {
    const map = new Map<number, TicketRank>()
    const ranked = query.data ?? []
    // Only a ranking of the current tickets counts (placeholder data may be for the old set).
    if (ranked.length !== inputs.length) return map
    for (const r of ranked) map.set(Number(r.key), { rank: r.rank, grade: r.grade, best: r.rank === 1 && ranked.length > 1 })
    return map
  }, [query.data, inputs.length])
  return { byIndex, updatedAt: query.dataUpdatedAt, isFetching: query.isFetching }
}
