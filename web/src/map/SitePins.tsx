import Overlay from 'ol/Overlay'
import { transform } from 'ol/proj'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Site } from '../api/types'
import { useMap } from './PolarMap'

export interface SitePinsProps {
  sites: readonly Site[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function SitePins({ sites, selectedId, onSelect }: SitePinsProps) {
  const map = useMap()
  const [targets, setTargets] = useState<{ site: Site; element: HTMLElement }[]>([])

  useEffect(() => {
    if (!map) return
    const projection = map.getView().getProjection()
    const overlays = sites.map((site) => {
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
  }, [map, sites])

  return (
    <>
      {targets.map(({ site, element }) =>
        createPortal(
          <button
            type="button"
            data-testid={`pin-${site.id}`}
            aria-label={site.name}
            aria-pressed={site.id === selectedId}
            className={site.id === selectedId ? 'pin pin-selected' : 'pin'}
            onClick={() => onSelect(site.id)}
          />,
          element,
          site.id,
        ),
      )}
    </>
  )
}
