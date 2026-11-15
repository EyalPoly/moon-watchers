import type MapBrowserEvent from 'ol/MapBrowserEvent'
import { transform } from 'ol/proj'
import { useEffect } from 'react'
import { pointId } from '../api/points'
import { useMap } from './PolarMap'

/** A click on the map places a new point there (inside the custom-point area). */
export function PlacePoint({ areaRadiusM, onPlace }: { areaRadiusM: number; onPlace: (siteId: string) => void }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const onClick = (e: MapBrowserEvent<PointerEvent>) => {
      if (Math.hypot(e.coordinate[0], e.coordinate[1]) > areaRadiusM) return
      const [lon, lat] = transform(e.coordinate, map.getView().getProjection(), 'EPSG:4326')
      onPlace(pointId(lat, lon))
    }
    map.on('singleclick', onClick)
    map.getTargetElement()?.classList.add('placing')
    return () => {
      map.un('singleclick', onClick)
      map.getTargetElement()?.classList.remove('placing')
    }
  }, [map, areaRadiusM, onPlace])
  return null
}
