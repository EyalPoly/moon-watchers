import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import meta from '@samples/meta.json'
import type { Meta } from '../api/types'
import { SCORE_DEFAULTS, WEIGHT_PRESETS, type ScoreSettings } from '../api/scoreSettings'
import { ScoreSettingsPanel } from './ScoreSettingsPanel'

afterEach(cleanup)

const spec = (meta as Meta).score

function setup(value: ScoreSettings = SCORE_DEFAULTS) {
  const onChange = vi.fn()
  const onCommit = vi.fn()
  render(<ScoreSettingsPanel spec={spec} value={value} onChange={onChange} onCommit={onCommit} />)
  return { onChange, onCommit }
}

test('seven weight sliders are labeled from the grades, and dust says simulated', () => {
  setup()
  for (const grade of spec.grades) expect(screen.getByRole('slider', { name: grade.label })).toBeTruthy()
  expect(screen.getAllByRole('slider', { name: /^(sunlight|station contact|longest|sunlight at landing|slope$|dust)/ }).length).toBe(7)
  expect(screen.getByText(/simulated/)).toBeTruthy()
})

test('picking Sunlight first commits its weights', () => {
  const { onCommit } = setup()
  fireEvent.change(screen.getByRole('combobox', { name: 'Weight preset' }), { target: { value: 'sunlight_first' } })
  const sunlightFirst = WEIGHT_PRESETS.find((p) => p.id === 'sunlight_first')
  expect(onCommit).toHaveBeenCalledWith({ ...SCORE_DEFAULTS, w: sunlightFirst?.weights })
})

test('weights that match no preset read Custom', () => {
  setup({ ...SCORE_DEFAULTS, w: [0.25, 0.5, 0.15, 0.15, 0.1, 0.1, 0] })
  expect((screen.getByRole('combobox', { name: 'Weight preset' }) as HTMLSelectElement).value).toBe('custom')
})

test('setting the last non-zero weight to 0 is refused with a message and commits nothing', () => {
  const { onChange, onCommit } = setup({ ...SCORE_DEFAULTS, w: [0.25, 0, 0, 0, 0, 0, 0] })
  const slider = screen.getByRole('slider', { name: 'sunlight' })
  fireEvent.change(slider, { target: { value: '0' } })
  fireEvent.pointerUp(slider)
  expect(screen.getByText('At least one weight must be above 0.')).toBeTruthy()
  expect(onChange).not.toHaveBeenCalled()
  expect(onCommit).not.toHaveBeenCalled()
})

test('dragging calls onChange and releasing commits once', () => {
  const { onChange, onCommit } = setup()
  const slider = screen.getByRole('slider', { name: 'station contact' })
  fireEvent.change(slider, { target: { value: '0.5' } })
  expect(onChange).toHaveBeenCalledWith({ ...SCORE_DEFAULTS, w: [0.25, 0.5, 0.15, 0.15, 0.1, 0.1, 0] })
  expect(onCommit).not.toHaveBeenCalled()
  fireEvent.pointerUp(slider)
  expect(onCommit).toHaveBeenCalledTimes(1)
  expect(onCommit).toHaveBeenCalledWith({ ...SCORE_DEFAULTS, w: [0.25, 0.5, 0.15, 0.15, 0.1, 0.1, 0] })
})

test('good slope above bad slope is refused', () => {
  const { onCommit } = setup()
  const field = screen.getByRole('textbox', { name: 'Fully good at, exact value' })
  fireEvent.change(field, { target: { value: '20' } })
  fireEvent.blur(field)
  expect(screen.getByText(/good slope cannot be above bad slope/i)).toBeTruthy()
  expect(onCommit).not.toHaveBeenCalled()
})

test('amber above green is refused', () => {
  const { onCommit } = setup()
  const field = screen.getByRole('textbox', { name: 'Amber from, exact value' })
  fireEvent.change(field, { target: { value: '80' } })
  fireEvent.blur(field)
  expect(screen.getByText(/amber cannot be above green/i)).toBeTruthy()
  expect(onCommit).not.toHaveBeenCalled()
})

test('a number off its step or range is refused by the field', () => {
  const { onCommit } = setup()
  const field = screen.getByRole('textbox', { name: 'Required sunlight at landing, exact value' })
  fireEvent.change(field, { target: { value: '6.3' } })
  fireEvent.blur(field)
  expect(screen.getByText(/0 to 72 h in steps of 0.5/)).toBeTruthy()
  expect(onCommit).not.toHaveBeenCalled()
})

test('Reset all restores the defaults', () => {
  const { onCommit } = setup({ ...SCORE_DEFAULTS, margin: 20 })
  fireEvent.click(screen.getByRole('button', { name: 'Reset all' }))
  expect(onCommit).toHaveBeenCalledWith(SCORE_DEFAULTS)
})

test('a changed setting is marked and has its own reset; unchanged ones have none', () => {
  const { onCommit } = setup({ ...SCORE_DEFAULTS, margin: 20 })
  expect(screen.getAllByRole('button', { name: /^Reset (?!all)/ }).length).toBe(1)
  const row = screen.getByRole('button', { name: 'Reset Landing margin before landing' }).closest('.setting')!
  expect(row.getAttribute('data-changed')).toBe('true')
  fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Reset Landing margin before landing' }))
  expect(onCommit).toHaveBeenCalledWith(SCORE_DEFAULTS)
})

test('the PSR switch commits straight away', () => {
  const { onCommit } = setup()
  fireEvent.click(screen.getByRole('switch', { name: 'Reject sites inside a PSR' }))
  expect(onCommit).toHaveBeenCalledWith({ ...SCORE_DEFAULTS, psr: false })
})

test('a drag that returns to the starting value still reports its release', () => {
  const { onCommit } = setup()
  const slider = screen.getByRole('slider', { name: 'station contact' })
  fireEvent.change(slider, { target: { value: '0.5' } })
  fireEvent.change(slider, { target: { value: '0.25' } })
  fireEvent.pointerUp(slider)
  expect(onCommit).toHaveBeenCalledTimes(1)
  expect(onCommit).toHaveBeenCalledWith(SCORE_DEFAULTS)
})
