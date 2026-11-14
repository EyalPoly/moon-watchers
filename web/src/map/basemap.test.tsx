import 'vitest-canvas-mock'
import { act, cleanup, render, screen } from '@testing-library/react'
import type OlMap from 'ol/Map'
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
