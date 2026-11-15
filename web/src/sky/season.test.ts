import { expect, test } from 'vitest'
import { seasonOutline, solarCurveDeg } from './season'

// Directions of a Sun at constant declination, taken through the engine's own az_el at the site.
const ENGINE: [lat: number, dec: number, az: number, el: number][] = [
  [-89, 1.5, 9.996946, -0.515187],
  [-89, 1.5, 99.972719, -1.673418],
  [-89, 1.5, 200.011767, -2.43966],
  [-89, 1.5, 300.018894, -0.999848],
  [-85, -1.5, 249.947213, -0.213225],
  [-85, -1.5, 339.884568, 6.197091],
  [-85, -1.5, 80.166146, 2.361632],
  [-85, -1.5, 180, -3.5],
]

test('the constant-declination curve matches the engine sky', () => {
  for (const [lat, dec, az, el] of ENGINE) expect(solarCurveDeg(az, lat, dec)).toBeCloseTo(el, 4)
})

test('the band is one closed outline from the left edge to the right edge', () => {
  const outline = seasonOutline({ latDeg: -89, minDeg: -1.5, maxDeg: 1.5 }, (az) => az, (el) => -el)
  expect(outline.startsWith('M0.0,')).toBe(true)
  expect(outline.endsWith('Z')).toBe(true)
  expect(outline).toContain('360.0,')
})
