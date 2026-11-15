import { useEffect } from 'react'
import type { Projection } from 'ol/proj'
import TileLayer from 'ol/layer/Tile'
import TileImage from 'ol/source/TileImage'
import TileGrid from 'ol/tilegrid/TileGrid'
import type { MapLayer } from '../ui/LayersBox'
import { useMap } from './PolarMap'

const QUICKMAP_IDS = {
  'South Pole Geomorphic Map': 'sdr_geomap',
  PSR: 'lpsr_shp_1sqkm',
  TerrainSlope: 'qts_demstack_slope',
} as const satisfies Partial<Record<MapLayer, string>>
type QuickmapId = (typeof QUICKMAP_IDS)[keyof typeof QUICKMAP_IDS]

// QuickMap's south-polar stereographic grid: one 512 px tile spans the whole ±931070 m
// extent at zoom 0, and the pole sits at its center.
const HALF_EXTENT_M = 931070
const TILE_PX = 512
const ZOOM_LEVELS = 8
const tileGrid = new TileGrid({
  origin: [-HALF_EXTENT_M, HALF_EXTENT_M],
  tileSize: TILE_PX,
  resolutions: Array.from({ length: ZOOM_LEVELS }, (_, z) => (2 * HALF_EXTENT_M) / TILE_PX / 2 ** z),
})

function createLayer(id: QuickmapId, projection: Projection) {
  const layer = new TileLayer({
    source: new TileImage({
      projection,
      tileGrid,
      crossOrigin: 'anonymous',
      attributions: 'NASA / LROC / ACT QuickMap',
      tileUrlFunction: ([z, x, y]) => `https://lroc-tiles.quickmap.io/tiles/${id}/lunar-steresp/${z}/${x}/${y}.png`,
    }),
  })
  layer.set('name', `data-layer-${id}`)
  return layer
}

export function QuickmapLayer({ layer }: { layer: MapLayer }) {
  const map = useMap()
  const id = layer in QUICKMAP_IDS ? QUICKMAP_IDS[layer as keyof typeof QUICKMAP_IDS] : null
  useEffect(() => {
    if (!map || !id) return
    const added = createLayer(id, map.getView().getProjection())
    const base = map.getLayers().getArray().some((l) => l.getClassName() === 'ol-layer relief-tiles') ? 1 : 0
    map.getLayers().insertAt(base, added)
    return () => { map.removeLayer(added) }
  }, [map, id])
  return null
}
