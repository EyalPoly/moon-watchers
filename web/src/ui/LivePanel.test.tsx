import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { LiveStatus } from '../state/series'
import { LivePanel } from './LivePanel'

afterEach(cleanup)

const known = { az: 10, el: 3, horizon: 1, clearance: 2, visible: true, change: { kind: 'at' as const, ms: 0, inMs: 3_600_000 } }

test('unknown terrain reads "Unknown (missing terrain)" and dashes, not numbers', () => {
  const status: LiveStatus = {
    sun: { ...known, horizon: null, clearance: null, visible: null, litFraction: null },
    earth: { ...known, stationUp: true },
  }
  const { container } = render(<LivePanel status={status} />)
  expect(screen.getByText(/Unknown \(missing terrain\)/)).toBeTruthy()
  const sun = container.querySelectorAll('.live-row')[0]
  expect(sun.textContent).toContain('—')
  expect(sun.textContent).not.toContain('NaN')
})

test('a station that cannot see the Moon is said so on the Earth row', () => {
  const status: LiveStatus = {
    sun: { ...known, litFraction: 1 },
    earth: { ...known, visible: false, stationUp: false },
  }
  render(<LivePanel status={status} />)
  expect(screen.getByText(/cannot see the Moon/)).toBeTruthy()
})
