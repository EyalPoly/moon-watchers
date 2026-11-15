import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import sampleA from '@samples/summary/sample_a.json'
import type { Summary } from '../api/types'
import { ScoreBox } from './ScoreBox'

afterEach(cleanup)

const base = (sampleA as Summary).score
const warning = (code: string) => ({ code, text: code, severity: 'caution' as const, affects: 'score' as const })

test('the illustrative note is always present', () => {
  render(<ScoreBox score={base} />)
  expect(screen.getByText(/Illustrative weights and thresholds, not validated landing criteria/)).toBeTruthy()
})

test('a site inside a PSR reads "excluded: inside a PSR"', () => {
  render(<ScoreBox score={{ ...base, value: 0, category: 'excluded', excluded_reason: 'psr', deciding: [] }} />)
  expect(screen.getByText('excluded: inside a PSR')).toBeTruthy()
})

test('a slope exclusion names the maximum slope', () => {
  const settings = { ...base.settings, slope_deg: [0, 15, 12] as [number, number, number] }
  render(<ScoreBox score={{ ...base, value: 0, category: 'excluded', excluded_reason: 'slope', settings }} />)
  expect(screen.getByText('excluded: slope above 12°')).toBeTruthy()
})

test('a null grade warning says the score uses missing data', () => {
  render(<ScoreBox score={{ ...base, warnings: [warning('NULL_GRADE:light')] }} />)
  expect(screen.getByText('score uses missing data')).toBeTruthy()
})

test('no badge for a clean score', () => {
  render(<ScoreBox score={base} />)
  expect(screen.queryByText(/missing data|excluded/)).toBeNull()
  expect(screen.queryByText('custom settings')).toBeNull()
})

test('custom settings are named', () => {
  render(<ScoreBox score={{ ...base, settings: { ...base.settings, custom: true } }} />)
  expect(screen.getByText('custom settings')).toBeTruthy()
})

test('the tooltip lists each factor, marks dust as simulated, and carries the explanation and formula', () => {
  const { container } = render(<ScoreBox score={base} />)
  const title = container.querySelector('.score')?.getAttribute('title') ?? ''
  expect(title.split('\n').filter((l) => l.includes('pts lost')).length).toBe(7)
  expect(title).toContain('dust: simulated')
  expect(title).toContain(base.explanation)
  expect(title).toContain(base.formula)
})
