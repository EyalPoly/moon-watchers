import { useEffect } from 'react'
import type { Projection } from 'ol/proj'
import TileLayer from 'ol/layer/Tile'
import TileImage from 'ol/source/TileImage'
import TileGrid from 'ol/tilegrid/TileGrid'
import { useMap } from './PolarMap'

export const DATA_LAYERS = [
  { id: 'sdr_geomap', label: 'South Pole Geomorphic Map' },
  { id: 'lpsr_shp_1sqkm', label: 'PSR (1 Km^2 or larger)' },
  { id: 'qts_demstack_slope', label: 'ACT TerrainSlope' },
] as const
// Bottom to top: the opaque slope raster must not cover the outlines and the map above it.
const DRAW_ORDER: readonly DataLayerId[] = ['qts_demstack_slope', 'lpsr_shp_1sqkm', 'sdr_geomap']
export type DataLayerId = (typeof DATA_LAYERS)[number]['id']

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

function createLayer(id: DataLayerId, projection: Projection) {
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

export function QuickmapLayers({ enabled }: { enabled: readonly DataLayerId[] }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const projection = map.getView().getProjection()
    const added = DRAW_ORDER.filter((id) => enabled.includes(id)).map((id) => createLayer(id, projection))
    const base = map.getLayers().getArray().some((l) => l.getClassName() === 'ol-layer relief-tiles') ? 1 : 0
    added.forEach((layer, i) => map.getLayers().insertAt(base + i, layer))
    return () => added.forEach((layer) => map.removeLayer(layer))
  }, [map, enabled])
  return null
}
