import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import sampleC from '@samples/summary/sample_c.json'
import type { Summary } from '../api/types'
import { MissionMetrics, VerdictChips } from './VerdictChips'

afterEach(cleanup)

const summary = sampleC as Summary

test('an unknown Sun chip shows "?" and "unavailable"', () => {
  render(<VerdictChips summary={summary} slopeDeg={4} />)
  const chip = screen.getByLabelText(/^Sun: unavailable/)
  expect(chip.textContent).toContain('?')
  expect(chip.textContent).toContain('unavailable')
})

test('a null metric reads "unavailable" with the unknown hours as the reason', () => {
  render(<MissionMetrics summary={summary} />)
  expect(screen.getAllByText('unavailable').length).toBeGreaterThan(0)
  expect(screen.getAllByText(/terrain unknown for 15\.7 h/).length).toBeGreaterThan(0)
})

test('the metrics list L, C, Earth-any and first sunlight', () => {
  render(<MissionMetrics summary={summary} />)
  for (const label of [/Sunlight \(L\)/, /Station contact \(C\)/, /Earth above horizon/, /First sunlight/]) {
    expect(screen.getByText(label)).toBeTruthy()
  }
})
