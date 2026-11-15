import { expect, test } from 'vitest'
import { formatLatLon, inPointArea, parsePointId, pointId } from './points'

test('a point id encodes the point and decodes back to it', () => {
  expect(pointId(-87.5, 45)).toBe('pt_s87500_e045000')
  expect(pointId(-85.1234, 239.0124)).toBe('pt_s85123_e239012')
  expect(parsePointId('pt_s85123_e239012')).toEqual({ lat: -85.123, lon: 239.012 })
  expect(parsePointId(pointId(-89.999, 359.999))).toEqual({ lat: -89.999, lon: 359.999 })
})

test('longitudes stay in [0, 360): 360 is written as 0 and a negative one counts around from 360', () => {
  expect(pointId(-86, 360)).toBe('pt_s86000_e000000')
  expect(pointId(-86, 180)).toBe('pt_s86000_e180000')
  expect(pointId(-86, -12.25)).toBe('pt_s86000_e347750')
})

test.each(['pt_s83000_e000000', 'pt_n87000_e000000', 'pt_s87000_e360001', 'pt_s87000_w001000', 'pt_s87000', 'sample_a', 'pt_s87000_x000001', ''])(
  '%j is not a valid point id',
  (id) => {
    expect(parsePointId(id)).toBeNull()
  },
)

test('the custom-point area is 84°S to 90°S', () => {
  expect(inPointArea(-84, 0)).toBe(true)
  expect(inPointArea(-90, 0)).toBe(true)
  expect(inPointArea(-83.99, 0)).toBe(false)
  expect(formatLatLon(-87.5, -12.25)).toBe('87.500°S 347.750°E')
})
