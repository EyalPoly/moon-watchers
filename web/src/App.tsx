import { useCallback, useEffect, useState } from 'react'
import meta from '@samples/meta.json'
import { resolveSource, type AppConfig } from './api/config'
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

  // The map never waits on the server: until meta arrives (or if it never does) the
  // bundled region is used.
  const region = metaQuery.data?.regions[0] ?? FALLBACK_REGION
  const sitesAreSample = resolveSource(config, 'sites', search) === 'sample'

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <SampleBanner visible={sitesAreSample} />
      <PolarMap region={region}>
        <SitePins sites={sites} selectedId={selected} onSelect={select} />
      </PolarMap>
      <div className="side-panel">
        {sitesQuery.isError ? (
          <ServerUnavailable onRetry={() => void sitesQuery.refetch()} />
        ) : (
          <SiteCard
            siteId={selected}
            sites={sites}
            onChange={select}
            isSample={sitesAreSample}
            site={detail.data}
          />
        )}
      </div>
    </div>
  )
}
