import Overlay from 'ol/Overlay'
import { transform } from 'ol/proj'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Site } from '../api/types'
import { useMap } from './PolarMap'

export interface SitePinsProps {
  sites: readonly Site[]
  selectedId: string | null
  /** Tag shown beside the selected pin, e.g. the point's letter "A". */
  selectedLabel?: string
  onSelect: (id: string) => void
}

export function SitePins({ sites, selectedId, selectedLabel, onSelect }: SitePinsProps) {
  const map = useMap()
  const [targets, setTargets] = useState<{ site: Site; element: HTMLElement }[]>([])
  // Overlays are rebuilt only when the set of sites or their positions change, not each
  // time the caller hands over a new array with the same sites.
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
    setTargets(overlays.map(({ site, element }) => ({ site, element })))
    return () => {
      overlays.forEach(({ overlay }) => map.removeOverlay(overlay))
      setTargets([])
    }
  }, [map, sitesKey])

  return (
    <>
      {targets.map(({ site, element }) =>
        createPortal(
          <span className="pin-wrap">
            <button
              type="button"
              data-testid={`pin-${site.id}`}
              aria-label={site.name}
              aria-pressed={site.id === selectedId}
              className={[
                'pin',
                site.id === selectedId && 'pin-selected',
                site.source === 'custom' && 'pin-custom',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(site.id)}
            />
            {site.id === selectedId && selectedLabel && (
              <span className="pin-tag mono" aria-hidden="true">
                {selectedLabel}
              </span>
            )}
          </span>,
          element,
          site.id,
        ),
      )}
    </>
  )
}
