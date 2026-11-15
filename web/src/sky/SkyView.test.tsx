import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { samples } from '../api/mocks/samples'
import { horizonAtMast, monthSeries } from '../api/mocks/synthetic'
import { DAY_MS, parseIsoMinute } from '../time'
import { SkyView } from './SkyView'

const t0 = parseIsoMinute('2027-03-01T00:00Z') as number

afterEach(cleanup)

test('draws the terrain, both paths and both disks, and describes them for screen readers', () => {
  const series = monthSeries(samples.site.sample_a, samples.horizon.sample_a, '2027-03')
  const { container } = render(
    <SkyView horizon={samples.horizon.sample_a} series={series} startMs={t0} endMs={t0 + 14 * DAY_MS} nowMs={t0 + DAY_MS} />,
  )
  expect(container.querySelector('.sky-terrain-edge')).not.toBeNull()
  expect(container.querySelectorAll('.sky-path-sun')).toHaveLength(2)
  expect(container.querySelectorAll('.sky-path-earth')).toHaveLength(2)
  expect(container.querySelector('.sky-disk-sun')).not.toBeNull()
  expect(container.querySelector('.sky-disk-earth')).not.toBeNull()
  // One tick per mission day for each body.
  expect(container.querySelectorAll('.sky-tick-sun')).toHaveLength(14)
  expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^Sky view at 2027-03-02T00:00Z: Sun at azimuth/)
})

test('without a series it still draws the horizon', () => {
  const { container } = render(
    <SkyView horizon={samples.horizon.sample_b} series={null} startMs={t0} endMs={t0 + DAY_MS} nowMs={t0} />,
  )
  expect(container.querySelector('.sky-terrain-edge')).not.toBeNull()
  expect(container.querySelector('.sky-disk-sun')).toBeNull()
  expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Sky view: terrain horizon around the site')
})

test('with the panel and the antenna at different heights, a second skyline is drawn', () => {
  const panel = samples.horizon.sample_a
  const antenna = horizonAtMast(panel, 4)
  const series = monthSeries(samples.site.sample_a, panel, '2027-03', { antennaHorizon: antenna })
  const view = (antennaHorizon?: typeof antenna) => (
    <SkyView horizon={panel} antennaHorizon={antennaHorizon} series={series} startMs={t0} endMs={t0 + DAY_MS} nowMs={t0} />
  )
  const { container, rerender } = render(view(antenna))
  expect(container.querySelector('.sky-terrain-edge-antenna')).not.toBeNull()
  rerender(view(panel))
  expect(container.querySelector('.sky-terrain-edge-antenna')).toBeNull()
  rerender(view(undefined))
  expect(container.querySelector('.sky-terrain-edge-antenna')).toBeNull()
})

test('an unknown contact step is drawn with the unknown class', () => {
  const series = monthSeries(samples.site.sample_a, samples.horizon.sample_a, '2027-03')
  series.contact[0] = null
  const { container } = render(
    <SkyView horizon={samples.horizon.sample_a} series={series} startMs={t0} endMs={t0 + DAY_MS} nowMs={t0} />,
  )
  expect(container.querySelector('.sky-contact-unknown')).not.toBeNull()
})

test('unknown terrain does not break the drawing', () => {
  const horizon = { ...samples.horizon.sample_a, elevation_deg: samples.horizon.sample_a.elevation_deg.map((v, i) => (i < 60 ? null : v)) }
  const { container } = render(<SkyView horizon={horizon} series={null} startMs={t0} endMs={t0 + DAY_MS} nowMs={t0} />)
  expect(container.querySelector('.sky-terrain-edge')).not.toBeNull()
  expect(container.querySelector('.sky-unknown-band')).not.toBeNull()
  expect(container.innerHTML).not.toContain('NaN')
})

test('a Sun season band is drawn only when the range is known', () => {
  const view = (sunSeason?: { latDeg: number; minDeg: number; maxDeg: number }) => (
    <SkyView horizon={samples.horizon.sample_a} series={null} startMs={t0} endMs={t0 + DAY_MS} nowMs={t0} sunSeason={sunSeason} />
  )
  const { container, rerender } = render(view())
  expect(container.querySelector('.sky-sun-season')).toBeNull()
  rerender(view({ latDeg: -89, minDeg: -1.55, maxDeg: 1.55 }))
  expect(container.querySelector('.sky-sun-season')).not.toBeNull()
})
