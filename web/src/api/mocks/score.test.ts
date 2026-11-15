import { expect, test } from 'vitest'
import meta from '@samples/meta.json'
import { SCORE_DEFAULTS, type ScoreSettings } from '../scoreSettings'
import { mockScore, type GradeId } from './score'

const RAW: Record<GradeId, number | null> = { L: 0.47, C: 0.32, DK: 350, OT: 290, LS: 146.5, S: 4.2, D: 0.35 }
const WINDOW_H = 732
const score = (over: Partial<ScoreSettings> = {}, raw = RAW, slope = 4.2, inPsr: boolean | null = false) =>
  mockScore(raw, slope, inPsr, { ...SCORE_DEFAULTS, ...over }, WINDOW_H)

test('penalties add up to the points below 100', () => {
  const s = score()
  const lost = s.factors.reduce((sum, f) => sum + f.points_lost, 0)
  expect(Math.abs(lost - (100 - s.value))).toBeLessThan(0.1)
  expect(s.factors.map((f) => f.name)).toEqual(['L', 'C', 'DK', 'OT', 'LS', 'S', 'D'])
  expect(s.factors.find((f) => f.name === 'DK')?.grade).toBeCloseTo(1 - 350 / WINDOW_H, 4)
  expect(s.status).toBe('illustrative')
  expect(s.settings.custom).toBe(false)
})

test('a weight of 0 removes its grade and its null warning', () => {
  const raw = { ...RAW, L: null }
  expect(score({}, raw).warnings.map((w) => w.code)).toContain('NULL_GRADE:light')
  const off = score({ w: [0, 0.25, 0.15, 0.15, 0.1, 0.1, 0] }, raw)
  expect(off.warnings.map((w) => w.code)).not.toContain('NULL_GRADE:light')
  expect(off.factors[0].points_lost).toBe(0)
  expect(off.value).toBe(score({ w: [0, 0.25, 0.15, 0.15, 0.1, 0.1, 0] }).value)
})

test('a null grade counts 0 and its text names the grade', () => {
  const s = score({}, { ...RAW, L: null })
  const warning = s.warnings.find((w) => w.code === 'NULL_GRADE:light')
  expect(warning?.text).toBe('Sunlight could not be computed, so its grade counts as 0.')
  expect(s.factors[0]).toMatchObject({ raw: null, grade: 0 })
  expect(s.explanation).toContain('Missing grades counted as 0: sunlight.')
})

test('slope 10,10,90 is a step at 10 degrees', () => {
  const only = { w: [0, 0, 0, 0, 0, 1, 0] as ScoreSettings['w'], slope: [10, 10, 90] as ScoreSettings['slope'] }
  expect(score(only, { ...RAW, S: 10 }, 10).factors[5].grade).toBe(1)
  expect(score(only, { ...RAW, S: 10.5 }, 10.5).factors[5].grade).toBe(0)
})

test('a site inside a PSR is excluded with every grade 0', () => {
  const s = score({}, RAW, 4.2, true)
  expect(s).toMatchObject({ value: 0, category: 'excluded', excluded_reason: 'psr', deciding: [] })
  expect(s.factors.every((f) => f.grade === 0)).toBe(true)
  expect(s.factors.reduce((sum, f) => sum + f.points_lost, 0)).toBeCloseTo(100, 1)
  expect(s.warnings.map((w) => w.code)).toContain('EXCLUDED_PSR')
  expect(score({ psr: false }, RAW, 4.2, true).category).not.toBe('excluded')
})

test('an unknown PSR gives PSR_UNKNOWN only while the check is on', () => {
  expect(score({}, RAW, 4.2, null).warnings.map((w) => w.code)).toContain('PSR_UNKNOWN')
  expect(score({ psr: false }, RAW, 4.2, null).warnings.map((w) => w.code)).not.toContain('PSR_UNKNOWN')
})

test('a slope above the maximum gives 0 and keeps the grades', () => {
  const s = score({}, { ...RAW, S: 15.5 }, 15.5)
  expect(s).toMatchObject({ value: 0, category: 'excluded', excluded_reason: 'slope', deciding: [] })
  expect(s.factors[0].grade).toBeCloseTo(0.47, 4)
  expect(s.warnings.find((w) => w.code === 'EXCLUDED_SLOPE')?.text).toBe(
    'Excluded: the slope 15.5° is above the 15° limit, so the score is 0.',
  )
  expect(score({}, RAW, 15.5, true).excluded_reason).toBe('psr')
})

test('the value is rounded to 0.1 before its color is chosen', () => {
  const s = score({ w: [1, 0, 0, 0, 0, 0, 0] }, { ...RAW, L: 0.6996 })
  expect(s.value).toBe(70)
  expect(s.category).toBe('green')
  expect(score({ colors: [50, 50], w: [1, 0, 0, 0, 0, 0, 0] }, { ...RAW, L: 0.499 }).category).toBe('red')
})

test('landing sunlight flips at the requirement', () => {
  const only = { w: [0, 0, 0, 0, 1, 0, 0] as ScoreSettings['w'] }
  expect(score(only, { ...RAW, LS: 5.99 }).factors[4].grade).toBe(0)
  expect(score(only, { ...RAW, LS: 6 }).factors[4].grade).toBe(1)
  expect(score({ ...only, sun_req: 0 }, { ...RAW, LS: 0 }).factors[4].grade).toBe(1)
})

test('ties are all deciding, and nothing lost leaves none', () => {
  const tie = score({ w: [0.5, 0.5, 0, 0, 0, 0, 0] }, { ...RAW, L: 0.5, C: 0.5 })
  expect(tie.deciding).toEqual(['L', 'C'])
  expect(tie.explanation).toBe(
    'Tied deciding factors: sunlight (average daily visible Sun-disk fraction 0.5; weight share 0.5; lost 25 points); ' +
      'station contact (average daily contact-time fraction 0.5; weight share 0.5; lost 25 points).',
  )
  const perfect = score({}, { L: 1, C: 1, DK: 0, OT: 0, LS: 100, S: 0, D: 0 }, 0)
  expect(perfect).toMatchObject({ value: 100, deciding: [] })
  expect(perfect.explanation).toBe('No grade lost points.')
})

test('the labels come from the meta sample', () => {
  expect(meta.score.grades.map((g) => g.id)).toEqual(['L', 'C', 'DK', 'OT', 'LS', 'S', 'D'])
  expect(score({ w: [1, 0, 0, 0, 0, 0, 0] }).explanation).toMatch(/^Deciding factor: sunlight \(average daily visible Sun-disk fraction/)
})

test('the single deciding factor shows points lost to two decimals, like the API', () => {
  const s = score({ w: [1, 0, 0, 0, 0, 0, 0] }, { ...RAW, L: 0.6666 })
  expect(s.explanation).toBe(
    'Deciding factor: sunlight (average daily visible Sun-disk fraction 0.67; weight share 1; lost 33.34 points).',
  )
})

test('the excluded-slope text fills the numbers the way the API does', () => {
  const s = score({ slope: [0, 15, 15.5] }, { ...RAW, S: 15.75 }, 15.75)
  expect(s.explanation).toBe('Excluded: the slope 15.75° is above the 15.5° limit, so the score is 0.')
})
