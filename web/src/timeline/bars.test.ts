import { describe, expect, it } from 'vitest'
import { barMinutes, dayTicks, windowsToBars } from './bars'
import { withScreen, parseScreen } from '../state/screen'

describe('windowsToBars', () => {
  it('turns UTC windows into minutes after landing', () => {
    expect(windowsToBars([['2027-03-02T00:00Z', '2027-03-02T06:00Z']], '2027-03-01T00:00Z', 10)).toEqual([
      { start: 1440, end: 1800, startMs: Date.UTC(2027, 2, 2), endMs: Date.UTC(2027, 2, 2, 6) },
    ])
  })

  it('clips windows that start before landing or end after the mission', () => {
    const bars = windowsToBars(
      [['2027-02-28T12:00Z', '2027-03-01T03:00Z'], ['2027-03-03T00:00Z', '2027-03-09T00:00Z']],
      '2027-03-01T00:00Z',
      5,
    )
    expect(bars.map((b) => [b.start, b.end])).toEqual([[0, 180], [2880, 7200]])
    // The tooltip keeps the real times.
    expect(bars[1].endMs).toBe(Date.UTC(2027, 2, 9))
  })

  it('drops windows outside the mission and broken ones', () => {
    expect(windowsToBars([['2027-02-20T00:00Z', '2027-02-21T00:00Z'], ['x', 'y'], ['2027-03-02T00:00Z', '2027-03-01T23:00Z']], '2027-03-01T00:00Z', 5)).toEqual([])
  })

  it('adds up the time covered', () => {
    expect(barMinutes(windowsToBars([['2027-03-01T00:00Z', '2027-03-01T01:00Z'], ['2027-03-01T02:00Z', '2027-03-01T02:30Z']], '2027-03-01T00:00Z', 1))).toBe(90)
  })
})

describe('dayTicks', () => {
  it('keeps the number of ticks readable', () => {
    expect(dayTicks(10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(dayTicks(29.53)).toEqual([0, 5, 10, 15, 20, 25])
    expect(dayTicks(120)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120])
    expect(dayTicks(365).length).toBeLessThanOrEqual(12)
  })
})

describe('screen in the URL', () => {
  it('reads and writes the Timelines screen, keeping the rest', () => {
    expect(parseScreen('?screen=timelines')).toBe('timelines')
    expect(parseScreen('?screen=other')).toBe('south_pole')
    expect(withScreen('?tk=sample_a&view=compare', 'timelines')).toBe('?tk=sample_a&screen=timelines')
    expect(withScreen('?tk=sample_a&screen=timelines', 'south_pole')).toBe('?tk=sample_a')
  })
})
