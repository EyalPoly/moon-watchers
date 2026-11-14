import { transform } from 'ol/proj'
import { useEffect } from 'react'
import type { Site } from '../api/types'
import { useMap } from './PolarMap'

/** Keeps a ticket's map centered on its site, so the chosen point is always in view. */
export function CenterOn({ site }: { site: Site | undefined }) {
  const map = useMap()
  const lat = site?.lat_deg
  const lon = site?.lon_deg
  useEffect(() => {
    if (!map || lat === undefined || lon === undefined) return
    const view = map.getView()
    view.animate({ center: transform([lon, lat], 'EPSG:4326', view.getProjection()), duration: 300 })
  }, [map, lat, lon])
  return null
}
