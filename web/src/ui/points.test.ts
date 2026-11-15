import { expect, test } from 'vitest'
import { formatLat, formatLon, parseCoord, pointLetter, slopeWord } from './points'

test('points are lettered A..Z, then AA, AB', () => {
  expect([0, 1, 25, 26, 27, 51, 52].map(pointLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA'])
})

test('coordinates format like the design and parse back', () => {
  expect(formatLat(-88.75)).toBe('88.75° S')
  expect(formatLon(44.2)).toBe('044.20° E')
  expect(formatLon(239.5)).toBe('239.50° E')
  expect(formatLon(-120.5)).toBe('239.50° E')
  expect(parseCoord(formatLat(-88.75), 'lat')).toBe(-88.75)
  expect(parseCoord(formatLon(239.5), 'lon')).toBe(239.5)
})

test.each([
  ['-87.5', 'lat', -87.5],
  ['87.5 S', 'lat', -87.5],
  ['87.5s', 'lat', -87.5],
  ['45', 'lon', 45],
  ['45° W', 'lon', null],
  ['-45', 'lon', null],
  ['360', 'lon', 0],
  ['361', 'lon', null],
  ['300 E', 'lon', 300],
  ['87.5 E', 'lat', null],
  ['95', 'lat', null],
  ['abc', 'lon', null],
  ['', 'lat', null],
] as const)('parseCoord(%j, %s) is %j', (text, axis, value) => {
  expect(parseCoord(text, axis)).toBe(value)
})

test('slope words follow the interim thresholds', () => {
  expect(slopeWord(4.2).word).toBe('Gentle')
  expect(slopeWord(6.8).word).toBe('Moderate')
  expect(slopeWord(12).word).toBe('Steep')
})
