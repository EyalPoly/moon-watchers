import { useEffect } from 'react'
import Feature from 'ol/Feature'
import Polygon from 'ol/geom/Polygon'
import VectorLayer from 'ol/layer/Vector'
import { transform } from 'ol/proj'
import VectorSource from 'ol/source/Vector'
import { Fill, Stroke, Style } from 'ol/style'
import type { RankedArea } from '../api/areas'
import type { LatLon } from '../api/points'
import type { PolygonLayer } from '../ui/LayersBox'
import { useMap } from './PolarMap'

export interface AppliedRegion {
  outline: LatLon[]
  areas: RankedArea[]
}

export function gradeColor(grade: number): string {
  const hue = grade >= 70 ? 141 : grade >= 40 ? 42 : 3
  const fraction = grade >= 70 ? (grade - 70) / 30 : grade >= 40 ? (grade - 40) / 30 : grade / 40
  return `hsl(${hue}, 72%, ${32 + fraction * 37}%)`
}

export function RegionOverlay({ selection, layer }: { selection: AppliedRegion | null; layer: PolygonLayer }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !selection || (layer !== 'Selected region' && layer !== 'Ranked areas')) return
    const projection = map.getView().getProjection()
    const feature = (corners: LatLon[], color: string) => {
      const ring = corners.map(({ lat, lon }) => transform([lon, lat], 'EPSG:4326', projection))
      const result = new Feature(new Polygon([[...ring, ring[0]]]))
      result.setStyle(new Style({ fill: new Fill({ color }), stroke: new Stroke({ color: '#dcf0df', width: 1.4 }) }))
      return result
    }
    const features = layer === 'Selected region' ? [feature(selection.outline, '#72ceae')]
      : selection.areas.map((cell) => feature(cell.corners, gradeColor(cell.grade)))
    const overlay = new VectorLayer({ className: 'ol-layer applied-area-polygons', source: new VectorSource({ features }), opacity: 0.58 })
    overlay.set('name', layer)
    map.addLayer(overlay)
    return () => { map.removeLayer(overlay) }
  }, [map, selection, layer])
  return null
}
