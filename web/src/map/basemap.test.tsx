import 'vitest-canvas-mock'
import { act, cleanup, render, screen } from '@testing-library/react'
import type OlMap from 'ol/Map'
import { Circle, LineString } from 'ol/geom'
import VectorLayer from 'ol/layer/Vector'
import { transform } from 'ol/proj'
import { afterEach, expect, test, vi } from 'vitest'
import meta from '@samples/meta.json'
import type { Region } from '../api/types'
import { PolarMap } from './PolarMap'

const region = meta.regions[0] as Region

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

afterEach(cleanup)

function hasCircle(map: OlMap): boolean {
  return map
    .getLayers()
    .getArray()
    .some((layer) => layer.get('name') === 'custom-area-circle')
}

async function mountWith(tileLoader: (tile: { setState(state: number): void }) => void) {
  const onBasemapError = vi.fn()
  let map: OlMap | undefined
  render(
    <PolarMap
      region={region}
      onBasemapError={onBasemapError}
      tileLoader={tileLoader}
      onMapReady={(m) => (map = m)}
    />,
  )
  expect(map).toBeDefined()
  await act(async () => {
    map!.setSize([512, 512])
    map!.renderSync()
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
  return { map: map!, onBasemapError }
}

test('a failing tile loader reports the error once and shows the fallback message', async () => {
  const { map, onBasemapError } = await mountWith((tile) => tile.setState(3))
  expect(onBasemapError).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Basemap unavailable')).toBeTruthy()
  expect(hasCircle(map)).toBe(true)
})

test('a working tile loader shows no fallback message and keeps the circle', async () => {
  const { map, onBasemapError } = await mountWith((tile) => tile.setState(2))
  expect(onBasemapError).not.toHaveBeenCalled()
  expect(screen.queryByText('Basemap unavailable')).toBeNull()
  expect(hasCircle(map)).toBe(true)
})

test('the lunar graticule has a meridian and a parallel at every five degrees across the polar map', async () => {
  const { map } = await mountWith((tile) => tile.setState(2))
  const layer = map.getLayers().getArray().find((item) => item.get('name') === 'lunar-graticule')
  if (!(layer instanceof VectorLayer)) throw new Error('Missing lunar graticule')
  const crs = map.getView().getProjection()
  const longitudes: number[] = []
  const latitudes: number[] = []
  for (const feature of layer.getSource()!.getFeatures()) {
    const geometry = feature.getGeometry()
    if (geometry instanceof LineString) {
      expect(geometry.getFirstCoordinate()).toEqual([0, 0])
      const [lon] = transform(geometry.getLastCoordinate(), crs, 'EPSG:4326')
      longitudes.push((Math.round(lon) + 360) % 360)
    } else if (geometry instanceof Circle) {
      const [, lat] = transform([geometry.getRadius(), 0], crs, 'EPSG:4326')
      latitudes.push(Math.round(lat))
    }
  }
  expect(longitudes.sort((a, b) => a - b)).toEqual(Array.from({ length: 72 }, (_, i) => 5 * i))
  expect(latitudes.sort((a, b) => a - b)).toEqual([-85, -80, -75, -70])
})
