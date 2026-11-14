import { useCallback, useEffect, useState } from 'react'
import meta from '@samples/meta.json'
import { anySample, resolveSource, type AppConfig } from './api/config'
import type { Region, Site } from './api/types'
import { PolarMap } from './map/PolarMap'
import { SitePins } from './map/SitePins'
import { parseUrlState, serializeUrlState } from './state/urlState'
import { useMeta, useSite, useSites } from './state/queries'
import { SampleBanner } from './ui/SampleBanner'
import { ServerUnavailable } from './ui/ServerUnavailable'
import { SiteCard } from './ui/SiteCard'

// Bundled region so the map still renders when the server is down.
const FALLBACK_REGION = meta.regions[0] as Region
const NO_SITES: readonly Site[] = []

export default function App({ config }: { config: AppConfig }) {
  const [search, setSearch] = useState(window.location.search)
  useEffect(() => {
    const onPop = () => setSearch(window.location.search)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const metaQuery = useMeta(config, search)
  const sitesQuery = useSites(config, search)
  const sites = sitesQuery.data?.sites ?? NO_SITES
  const selected = parseUrlState(search, sites.map((s) => s.id)).site
  const detail = useSite(config, search, selected)

  const select = useCallback(
    (id: string | null) => {
      const next = serializeUrlState({ site: id }, window.location.search)
      window.history.pushState({}, '', `${window.location.pathname}${next}`)
      setSearch(window.location.search)
    },
    [],
  )

  const region = metaQuery.data?.regions[0] ?? (metaQuery.isError ? FALLBACK_REGION : undefined)

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <SampleBanner visible={anySample(config, search)} />
      {region ? (
        <PolarMap region={region}>
          <SitePins sites={sites} selectedId={selected} onSelect={select} />
        </PolarMap>
      ) : (
        <p>Loading…</p>
      )}
      <div className="side-panel">
        {sitesQuery.isError ? (
          <ServerUnavailable onRetry={() => void sitesQuery.refetch()} />
        ) : (
          <SiteCard
            siteId={selected}
            sites={sites}
            onChange={select}
            isSample={resolveSource(config, 'sites', search) === 'sample'}
            site={detail.data}
          />
        )}
      </div>
    </div>
  )
}
