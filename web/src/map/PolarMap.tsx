import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import 'ol/ol.css'
import Feature from 'ol/Feature'
import OlMap from 'ol/Map'
import View from 'ol/View'
import { Circle as CircleGeometry } from 'ol/geom'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import ImageTile from 'ol/ImageTile'
import TileImage from 'ol/source/TileImage'
import VectorSource from 'ol/source/Vector'
import { Stroke, Style } from 'ol/style'
import TileGrid from 'ol/tilegrid/TileGrid'
import type { Region } from '../api/types'
import { parallelRadiusM, registerRegionProjection } from './projection'

type TileLoader = (tile: { setState(state: number): void }) => void

export interface PolarMapProps {
  region: Region
  onBasemapError?: () => void
  tileLoader?: TileLoader
  onMapReady?: (map: OlMap) => void
  children?: ReactNode
}

const MapContext = createContext<OlMap | null>(null)

export function useMap(): OlMap | null {
  return useContext(MapContext)
}

export function PolarMap({ region, onBasemapError, tileLoader, onMapReady, children }: PolarMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<OlMap | null>(null)
  const [basemapFailed, setBasemapFailed] = useState(false)
  const onErrorRef = useRef(onBasemapError)
  const onReadyRef = useRef(onMapReady)
  const tileLoaderRef = useRef(tileLoader)
  onErrorRef.current = onBasemapError
  onReadyRef.current = onMapReady
  tileLoaderRef.current = tileLoader

  useEffect(() => {
    if (!container.current) return
    const projection = registerRegionProjection(region)
    const layer = region.layers[0]
    const tileGrid = new TileGrid({
      origin: region.tile_grid.origin,
      resolutions: region.tile_grid.resolutions_m,
      tileSize: region.tile_grid.tile_size_px,
    })

    const layers = []
    if (layer?.url_template) {
      const template = layer.url_template
      const source = new TileImage({
        projection,
        tileGrid,
        attributions: layer.attribution,
        crossOrigin: 'anonymous',
        tileUrlFunction: ([z, x, y]) =>
          template.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x)),
        tileLoadFunction: (tile, src) => {
          const custom = tileLoaderRef.current
          if (custom) {
            custom(tile)
            return
          }
          const image = (tile as ImageTile).getImage() as HTMLImageElement
          image.src = src
        },
      })
      let reported = false
      source.on('tileloaderror', () => {
        if (reported) return
        reported = true
        setBasemapFailed(true)
        onErrorRef.current?.()
      })
      layers.push(new TileLayer({ source }))
    }

    const circle = new VectorLayer({
      source: new VectorSource({
        features: [
          new Feature(new CircleGeometry([0, 0], parallelRadiusM(region, region.custom_area.max_lat_deg))),
        ],
      }),
      style: new Style({ stroke: new Stroke({ color: '#a3e635', width: 2, lineDash: [8, 8] }) }),
    })
    circle.set('name', 'custom-area-circle')
    layers.push(circle)

    const created = new OlMap({
      target: container.current,
      layers,
      view: new View({
        projection,
        center: [0, 0],
        resolutions: region.tile_grid.resolutions_m,
        extent: region.extent_m,
        resolution: region.tile_grid.resolutions_m[region.tile_grid.resolutions_m.length - 2],
      }),
    })
    setMap(created)
    onReadyRef.current?.(created)
    return () => {
      created.setTarget(undefined)
      created.dispose()
      setMap(null)
    }
  }, [region])

  return (
    <div className="polar-map" style={{ position: 'relative', width: '100%', height: '100%', background: '#0b0d10' }}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {basemapFailed && (
        <div role="alert" className="basemap-unavailable" style={{ position: 'absolute', left: 12, top: 12, color: '#e5e7eb' }}>
          Basemap unavailable
        </div>
      )}
      <MapContext.Provider value={map}>{children}</MapContext.Provider>
    </div>
  )
}
