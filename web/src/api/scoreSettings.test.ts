import { expect, test } from 'vitest'
import meta from '@samples/meta.json'
import {
  SCORE_DEFAULTS,
  WEIGHT_PRESETS,
  isCustom,
  parseScoreSettings,
  serializeScoreSettings,
  settingsQuery,
} from './scoreSettings'

const spec = (key: string) => (meta.score.settings.find((s) => s.key === key) as { default: number[] }).default

test('the defaults and presets match the meta sample', () => {
  expect(SCORE_DEFAULTS.w).toEqual(spec('w'))
  expect([SCORE_DEFAULTS.sun_req]).toEqual(spec('sun_req'))
  expect(SCORE_DEFAULTS.slope).toEqual(spec('slope'))
  expect([SCORE_DEFAULTS.psr ? 1 : 0]).toEqual(spec('psr'))
  expect([SCORE_DEFAULTS.margin]).toEqual(spec('margin'))
  expect(SCORE_DEFAULTS.colors).toEqual(spec('colors'))
  expect(WEIGHT_PRESETS).toEqual(meta.score.presets)
})

test('no query is the defaults, and the defaults write nothing', () => {
  expect(parseScoreSettings('')).toEqual(SCORE_DEFAULTS)
  expect(serializeScoreSettings(SCORE_DEFAULTS)).toBe('')
  expect(isCustom(SCORE_DEFAULTS)).toBe(false)
})

test('a custom set round-trips and writes only what differs, in a fixed order', () => {
  const custom = { w: [0.6, 0.2, 0, 0, 0, 0.1, 0.1], sun_req: 12.5, slope: [2, 10, 20], psr: false, margin: 6, colors: [80, 50] } as const
  const settings = { ...custom, w: [...custom.w], slope: [...custom.slope], colors: [...custom.colors] } as typeof SCORE_DEFAULTS
  const text = serializeScoreSettings(settings)
  expect(text).toBe('?w=0.6,0.2,0,0,0,0.1,0.1&sun_req=12.5&slope=2,10,20&psr=0&margin=6&colors=80,50')
  expect(parseScoreSettings(text)).toEqual(settings)
  expect(isCustom(settings)).toBe(true)
  expect(serializeScoreSettings({ ...SCORE_DEFAULTS, margin: 6 })).toBe('?margin=6')
})

test('other query parameters are kept', () => {
  expect(serializeScoreSettings({ ...SCORE_DEFAULTS, psr: false }, '?site=x&margin=3')).toBe('?site=x&psr=0')
})

test.each([
  ['?w=1,1,1,0', 'w'],
  ['?w=2,0,0,0,0,0,0', 'w'],
  ['?w=0,0,0,0,0,0,0', 'w'],
  ['?w=0.33,0,0,0,0,0,0', 'w'],
  ['?sun_req=73', 'sun_req'],
  ['?sun_req=0.3', 'sun_req'],
  ['?slope=20,10,15', 'slope'],
  ['?slope=0,15', 'slope'],
  ['?psr=2', 'psr'],
  ['?margin=12.5', 'margin'],
  ['?margin=49', 'margin'],
  ['?colors=40,70', 'colors'],
  ['?colors=70.5,40', 'colors'],
] as const)('%s falls back to the default for %s only', (search, key) => {
  const parsed = parseScoreSettings(search)
  expect(parsed).toEqual(SCORE_DEFAULTS)
  expect(parsed[key]).toEqual(SCORE_DEFAULTS[key])
})

test('one invalid key does not discard the valid ones', () => {
  expect(parseScoreSettings('?w=1,1,1,0&margin=6')).toEqual({ ...SCORE_DEFAULTS, margin: 6 })
})

test('the query writes every setting in canonical form', () => {
  expect(settingsQuery(SCORE_DEFAULTS)).toEqual({
    w: '0.25,0.25,0.15,0.15,0.1,0.1,0',
    sun_req: 6,
    slope: '0,15,15',
    psr: 1,
    margin: 12,
    colors: '70,40',
  })
  expect(settingsQuery({ ...SCORE_DEFAULTS, psr: false }).psr).toBe(0)
})
