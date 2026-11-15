import 'vitest-canvas-mock'
import { act, cleanup, render } from '@testing-library/react'
import type OlMap from 'ol/Map'
import { afterEach, expect, test, vi } from 'vitest'
import meta from '@samples/meta.json'
import sitesResponse from '@samples/sites.json'
import type { Region, Site } from '../api/types'
import { PlacePoint } from './PlacePoint'
import { PolarMap } from './PolarMap'
import { parallelRadiusM } from './projection'
import { SitePins } from './SitePins'

const region = meta.regions[0] as Region
const radius = parallelRadiusM(region, region.custom_area.max_lat_deg)

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

afterEach(cleanup)

async function mount(extra?: React.ReactNode) {
  const onPlace = vi.fn()
  let map: OlMap | undefined
  render(
    <PolarMap region={region} onMapReady={(m) => (map = m)}>
      <PlacePoint areaRadiusM={radius} onPlace={onPlace} />
      {extra}
    </PolarMap>,
  )
  await act(async () => {
    map!.setSize([512, 512])
    map!.renderSync()
  })
  return { map: map!, onPlace }
}

const click = (map: OlMap, coordinate: number[]) => map.dispatchEvent({ type: 'singleclick', coordinate } as never)

test('a click inside the area places that point', async () => {
  const { map, onPlace } = await mount()
  click(map, [0, 100_000])
  expect(onPlace).toHaveBeenCalledTimes(1)
  expect(onPlace.mock.calls[0][0]).toMatch(/^pt_s/)
})

test('a click outside the area is ignored', async () => {
  const { map, onPlace } = await mount()
  click(map, [0, radius + 1])
  expect(onPlace).not.toHaveBeenCalled()
})

test('pin overlays stop map events, so a pin click cannot also place a point', async () => {
  const sites = sitesResponse.sites as Site[]
  const { map } = await mount(
    <SitePins sites={sites.slice(0, 1)} selectedId={null} labels={new Map()} activeLabel="A" onFocus={() => {}} onSelect={() => {}} />,
  )
  const overlays = map.getOverlays().getArray()
  expect(overlays.length).toBeGreaterThan(0)
  const stopping = map.getOverlayContainerStopEvent()
  expect(overlays.every((o) => stopping.contains(o.getElement() ?? null))).toBe(true)
})
