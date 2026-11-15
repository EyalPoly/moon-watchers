import { boundingExtent } from 'ol/extent'
import { transform } from 'ol/proj'
import { useEffect } from 'react'
import type { Site } from '../api/types'
import { useMap } from './PolarMap'

/** Fit the shown landing sites when their locations change. Keep manual pans and zooms otherwise. */
export function CenterOn({ sites }: { sites: readonly Site[] }) {
  const map = useMap()
  const coordinates = sites.map((s) => [s.lon_deg, s.lat_deg].join(',')).sort().join('|')
  useEffect(() => {
    if (!map || !coordinates) return
    const view = map.getView()
    const points = coordinates.split('|').map((pair) => transform(pair.split(',').map(Number), 'EPSG:4326', view.getProjection()))
    if (points.length === 1) view.animate({ center: points[0], duration: 250 })
    else view.fit(boundingExtent(points), { padding: [42, 42, 42, 42], maxZoom: Math.max(4, view.getZoom() ?? 4), duration: 250 })
  }, [map, coordinates])
  return null
}
