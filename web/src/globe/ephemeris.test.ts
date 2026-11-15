/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { directionsAt } from './ephemeris'

function table(year: number) {
  const bytes = readFileSync(resolve('public/orbit/ephemeris', year + '.bin'))
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
}

test('the opening UTC is in the mean-Earth frame with east-positive longitude', () => {
  // Independent apparent sub-observer and subsolar coordinates in the kit's JPL Horizons check.
  const sky = directionsAt(table(2026), 2026, Date.parse('2026-10-15T08:30Z'))
  for (const [v, lon, lat] of [[sky.earth, 1.683966, 6.348807], [sky.sun, 127.624701, -1.276561]] as const) {
    expect(Math.atan2(v[1], v[0]) * 180 / Math.PI).toBeCloseTo(lon, 1)
    expect(Math.asin(v[2]) * 180 / Math.PI).toBeCloseTo(lat, 1)
  }
})

test('the last hourly sample also starts the next year, including leap years', () => {
  for (let year = 2026; year < 2030; year++) {
    const end = Date.UTC(year + 1, 0, 1)
    const a = directionsAt(table(year), year, end)
    const b = directionsAt(table(year + 1), year + 1, end)
    expect(a.sun).toEqual(b.sun)
    expect(a.earth).toEqual(b.earth)
    Array.from(a.earthFixedToMoon!).forEach((v, i) => expect(v).toBeCloseTo(b.earthFixedToMoon![i], 10))
  }
})
