import { expect, test } from 'vitest'
import { LUNAR_DAY_MS, formatDuration, formatIsoMinute, monthsBetween, parseIsoMinute } from './time'

test('ISO minutes round-trip and reject impossible dates', () => {
  const ms = parseIsoMinute('2027-03-01T14:20Z')
  expect(ms).not.toBeNull()
  expect(formatIsoMinute(ms as number)).toBe('2027-03-01T14:20Z')
  for (const bad of ['2027-02-30T00:00Z', '2027-13-01T00:00Z', '2027-03-01T24:00Z', '2027-03-01', 'x']) {
    expect(parseIsoMinute(bad)).toBeNull()
  }
})

test('one lunar day is 29 d 12 h 40 min on the 10-minute grid', () => {
  const t0 = parseIsoMinute('2027-03-01T00:00Z') as number
  expect(formatIsoMinute(t0 + LUNAR_DAY_MS)).toBe('2027-03-30T12:40Z')
})

test('months between covers a mission that crosses a year', () => {
  const a = parseIsoMinute('2027-12-20T00:00Z') as number
  const b = parseIsoMinute('2028-02-01T00:00Z') as number
  expect(monthsBetween(a, b)).toEqual(['2027-12', '2028-01', '2028-02'])
  expect(monthsBetween(a, a)).toEqual(['2027-12'])
})

test('durations never show seconds', () => {
  expect(formatDuration(40 * 60_000)).toBe('40 min')
  expect(formatDuration((3 * 60 + 20) * 60_000)).toBe('3 h 20 min')
  expect(formatDuration((2 * 24 + 4) * 3_600_000 + 59_000)).toBe('2 d 4 h')
  expect(formatDuration(-5)).toBe('0 min')
})
