import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { samples } from '../api/mocks/samples'
import { monthSeries } from '../api/mocks/synthetic'
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
