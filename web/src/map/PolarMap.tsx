import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import 'ol/ol.css'
import Feature from 'ol/Feature'
import { platformModifierKeyOnly } from 'ol/events/condition'
import { MouseWheelZoom, defaults as defaultInteractions } from 'ol/interaction'
import OlMap from 'ol/Map'
import View from 'ol/View'
import { Circle as CircleGeometry, LineString } from 'ol/geom'
import type BaseEvent from 'ol/events/Event'
import type Layer from 'ol/layer/Layer'
import type RenderEvent from 'ol/render/Event'
import { apply as applyTransform } from 'ol/transform'
import { transform } from 'ol/proj'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import ImageTile from 'ol/ImageTile'
import TileImage from 'ol/source/TileImage'
import VectorSource from 'ol/source/Vector'
import { Stroke, Style } from 'ol/style'
import TileGrid from 'ol/tilegrid/TileGrid'
import type { Region } from '../api/types'
import { parallelRadiusM, registerRegionProjection } from './projection'

function clipToCircle(layer: Layer, radiusM: number) {
  layer.on('prerender', (event: BaseEvent) => {
    const { context, frameState } = event as RenderEvent
    if (!context || !frameState) return
    const ctx = context as CanvasRenderingContext2D
    const [cx, cy] = applyTransform(frameState.coordinateToPixelTransform, [0, 0])
    const pixelRatio = frameState.pixelRatio
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx * pixelRatio, cy * pixelRatio, (radiusM / frameState.viewState.resolution) * pixelRatio, 0, 2 * Math.PI)
    ctx.clip()
  })
  layer.on('postrender', (event: BaseEvent) => {
    ;((event as RenderEvent).context as CanvasRenderingContext2D | undefined)?.restore()
  })
}

type TileLoader = (tile: { setState(state: number): void }) => void

export interface PolarMapProps {
  region: Region
  showRelief?: boolean
  showBoundary?: boolean
  themed?: boolean
  onBasemapError?: () => void
  tileLoader?: TileLoader
  onMapReady?: (map: OlMap) => void
  /** With several maps on a scrolling page, plain scrolling moves the page and only
   *  Ctrl (Cmd on a Mac) + scroll zooms the map. */
  wheelNeedsModifier?: boolean
  children?: ReactNode
}

const MapContext = createContext<OlMap | null>(null)

export function useMap(): OlMap | null {
  return useContext(MapContext)
}

export function PolarMap({
  region,
  showRelief = true,
  showBoundary = true,
  themed = false,
  onBasemapError,
  tileLoader,
  onMapReady,
  wheelNeedsModifier = false,
  children,
}: PolarMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const reliefRef = useRef<TileLayer<TileImage> | null>(null)
  const [map, setMap] = useState<OlMap | null>(null)
  const [basemapFailed, setBasemapFailed] = useState(false)
  const onErrorRef = useRef(onBasemapError)
  const onReadyRef = useRef(onMapReady)
  const tileLoaderRef = useRef(tileLoader)
  onErrorRef.current = onBasemapError
  onReadyRef.current = onMapReady
  tileLoaderRef.current = tileLoader
  const wheelRef = useRef(wheelNeedsModifier)
  useEffect(() => {
    wheelRef.current = wheelNeedsModifier
  }, [wheelNeedsModifier])
  const [wheelHint, setWheelHint] = useState(false)
  useEffect(() => {
    if (!wheelHint) return
    const timer = setTimeout(() => setWheelHint(false), 1500)
    return () => clearTimeout(timer)
  }, [wheelHint])

  useEffect(() => {
    if (!container.current) return
    const projection = registerRegionProjection(region)
    const layer = region.layers[0]
    const tileGrid = new TileGrid({
      origin: region.tile_grid.origin,
      resolutions: region.tile_grid.resolutions_m,
      tileSize: region.tile_grid.tile_size_px,
    })

    const boundaryRadius = parallelRadiusM(region, region.custom_area.max_lat_deg)
    const viewExtent = [-boundaryRadius, -boundaryRadius, boundaryRadius, boundaryRadius]
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
      reliefRef.current = new TileLayer({ source, className: 'ol-layer relief-tiles', extent: viewExtent })
      clipToCircle(reliefRef.current, boundaryRadius)
      layers.push(reliefRef.current)
    }

    // In this south-polar stereographic projection, parallels are concentric circles
    // and meridians are straight rays. Extend the rays to the corners of the map.
    const [west, south, east, north] = region.extent_m
    const radius = Math.hypot(Math.max(Math.abs(west), Math.abs(east)), Math.max(Math.abs(south), Math.abs(north)))
    const [, outerLatitude] = transform([0, radius], projection, 'EPSG:4326')
    const grid: Feature[] = []
    for (let lon = 0; lon < 360; lon += 5) {
      const end = transform([lon, outerLatitude], 'EPSG:4326', projection)
      grid.push(new Feature(new LineString([[0, 0], end])))
    }
    for (let lat = -85; lat <= outerLatitude; lat += 5) {
      grid.push(new Feature(new CircleGeometry([0, 0], parallelRadiusM(region, lat))))
    }
    const graticule = new VectorLayer({
      className: 'ol-layer lunar-graticule',
      extent: viewExtent,
      source: new VectorSource({ features: grid, wrapX: false }),
      style: [
        new Style({ stroke: new Stroke({ color: 'rgba(14, 24, 24, .36)', width: 1.8 }) }),
        new Style({ stroke: new Stroke({ color: 'rgba(227, 238, 229, .50)', width: .75 }) }),
      ],
    })
    clipToCircle(graticule, boundaryRadius)
    graticule.set('name', 'lunar-graticule')
    layers.push(graticule)

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
      interactions: defaultInteractions({ mouseWheelZoom: false }).extend([
        new MouseWheelZoom({ condition: (e) => !wheelRef.current || platformModifierKeyOnly(e) }),
      ]),
      view: new View({
        projection,
        center: [0, 0],
        resolutions: region.tile_grid.resolutions_m,
        extent: viewExtent,
        resolution: region.tile_grid.resolutions_m[Math.min(4, region.tile_grid.resolutions_m.length - 1)],
      }),
    })
    const [width, height] = created.getSize() ?? [0, 0]
    if (width > 0 && height > 0) created.getView().fit(viewExtent, { size: [width, height] })
    setMap(created)
    onReadyRef.current?.(created)
    return () => {
      reliefRef.current = null
      created.setTarget(undefined)
      created.dispose()
      setMap(null)
    }
  }, [region])

  useEffect(() => {
    reliefRef.current?.setVisible(showRelief)
  }, [region, showRelief])

  useEffect(() => {
    map?.getLayers().getArray().find((layer) => layer.get('name') === 'custom-area-circle')?.setVisible(showBoundary)
  }, [map, showBoundary])

  return (
    <div
      className={themed ? 'polar-map map-thematic' : 'polar-map'}
      style={{ position: 'relative', width: '100%', height: '100%', background: '#0b0d10' }}
      onWheel={(e) => {
        if (wheelNeedsModifier && !e.ctrlKey && !e.metaKey) setWheelHint(true)
      }}
    >
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {showRelief && basemapFailed && (
        <div role="alert" className="basemap-unavailable" style={{ position: 'absolute', left: 12, top: 12, color: '#e5e7eb' }}>
          Basemap unavailable
        </div>
      )}
      {wheelHint && (
        <div className="map-wheel-hint" role="status">
          Ctrl + scroll to zoom the map
        </div>
      )}
      <MapContext.Provider value={map}>{children}</MapContext.Provider>
    </div>
  )
}
