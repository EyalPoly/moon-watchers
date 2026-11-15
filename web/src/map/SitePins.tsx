import Overlay from 'ol/Overlay'
import { transform } from 'ol/proj'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppConfig } from '../api/config'
import { useSummary } from '../state/queries'
import { useScenario } from '../state/scenario'
import type { Ticket } from '../state/tickets'
import { mapReading } from '../ui/MapLegend'
import type { MapLayer } from '../ui/LayersBox'
import type { Site } from '../api/types'
import { siteDisplayName } from '../ui/points'
import { useMap } from './PolarMap'

export interface SitePinsProps {
  layer?: MapLayer
  ticket?: Ticket
  config?: AppConfig
  search?: string
  sites: readonly Site[]
  selectedId: string | null
  labels: ReadonlyMap<string, string[]>
  activeLabel: string
  onFocus: (label: string) => void
  onSelect: (id: string) => void
}

export function SitePins({ layer = 'Relief', config, search = '', ticket, sites, selectedId, labels, activeLabel, onFocus, onSelect }: SitePinsProps) {
  const map = useMap()
  const [targets, setTargets] = useState<{ id: string; element: HTMLElement }[]>([])
  // Overlays are rebuilt only when the set of sites or their positions change, not each
  // time the caller hands over a new array with the same sites.
  const currentSites = new Map(sites.map((site) => [site.id, site]))
  const sitesKey = sites.map((s) => `${s.id}@${s.lat_deg},${s.lon_deg}`).join('|')
  const sitesRef = useRef(sites)
  useLayoutEffect(() => {
    sitesRef.current = sites
  })

  useEffect(() => {
    if (!map) return
    const projection = map.getView().getProjection()
    const overlays = sitesRef.current.map((site) => {
      const element = document.createElement('div')
      const overlay = new Overlay({
        element,
        position: transform([site.lon_deg, site.lat_deg], 'EPSG:4326', projection),
        positioning: 'center-center',
      })
      map.addOverlay(overlay)
      return { site, element, overlay }
    })
    setTargets(overlays.map(({ site, element }) => ({ id: site.id, element })))
    return () => {
      overlays.forEach(({ overlay }) => map.removeOverlay(overlay))
      setTargets([])
    }
  }, [map, sitesKey])

  return (
    <>
      {targets.map(({ id, element }) => {
        const site = currentSites.get(id)
        if (!site) return null
        return createPortal(
          <span className="pin-wrap">
            <button
              type="button"
              data-testid={`pin-${site.id}`}
              aria-label={siteDisplayName(site)}
              aria-pressed={site.id === selectedId}
              className={[
                'pin',
                labels.has(site.id) && 'pin-selected',
                site.source === 'custom' && 'pin-custom',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(site.id)}
            />
            {layer !== 'Relief' && config && ticket && <SiteReading layer={layer} config={config} search={search} ticket={ticket} site={site} />}
            {labels.has(site.id) && (
              <span className="pin-tags">
                {labels.get(site.id)?.map((label) => (
                  <button key={label} type="button" className="pin-tag mono" aria-label={`Focus site ${label}`}
                    aria-pressed={label === activeLabel} onClick={() => onFocus(label)}>{label}</button>
                ))}
              </span>
            )}
          </span>,
          element,
          site.id,
        )
      })}
    </>
  )
}

function SiteReading({ layer, config, search, ticket, site }: {
  layer: MapLayer; config: AppConfig; search: string; ticket: Ticket; site: Site
}) {
  const needsSummary = layer === 'Earth DTE' || layer === 'Lunar regolith'
  const scenario = useScenario(needsSummary ? site.id : null, ticket, ticket.station)
  const query = useSummary(config, search, scenario)
  const reading = mapReading(layer, site, query.isPlaceholderData ? undefined : query.data)
  const text = needsSummary && query.isPending && !query.isError ? '…' : reading.text
  return <span className="site-map-reading" style={{ borderColor: reading.color }}
    aria-label={`${site.name}, ${layer}: ${text}`}><i style={{ backgroundColor: reading.color }} />{text}</span>
}
