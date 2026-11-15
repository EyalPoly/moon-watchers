import type { Scenario } from './types'

export type ScoreSettings = Pick<Scenario, 'w' | 'sun_req' | 'slope' | 'psr' | 'margin' | 'colors'>

export const SCORE_DEFAULTS: ScoreSettings = {
  w: [0.25, 0.25, 0.15, 0.15, 0.1, 0.1, 0],
  sun_req: 6,
  slope: [0, 15, 15],
  psr: true,
  margin: 12,
  colors: [70, 40],
}

export const WEIGHT_PRESETS: readonly { id: string; name: string; weights: Scenario['w'] }[] = [
  { id: 'default', name: 'Default', weights: [0.25, 0.25, 0.15, 0.15, 0.1, 0.1, 0] },
  { id: 'sunlight_first', name: 'Sunlight first', weights: [0.6, 0.2, 0, 0, 0, 0.1, 0.1] },
]

export const SETTING_KEYS = ['w', 'sun_req', 'slope', 'psr', 'margin', 'colors'] as const
export type SettingKey = (typeof SETTING_KEYS)[number]

const NUMBER = /^-?\d+(?:\.\d+)?$/

/** The shortest spelling of a number, so equal settings give equal URLs. */
const canon = (v: number) => String(Number(v.toFixed(2)))
const list = (values: readonly number[]) => values.map(canon).join(',')

const onStep = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-6

function numbers(raw: string, count: number): number[] | null {
  const parts = raw.split(',')
  return parts.length === count && parts.every((p) => NUMBER.test(p)) ? parts.map(Number) : null
}

/** What the server refuses for each key; the text is what the mock answers with. */
export const SETTING_RULES: Record<SettingKey, { message: string; parse: (raw: string) => unknown }> = {
  w: {
    message: 'w must be seven weights L,C,DK,OT,LS,S,D, each 0-1 in steps of 0.05, at least one above 0',
    parse(raw) {
      const v = numbers(raw, 7)
      if (!v || !v.every((x) => x >= 0 && x <= 1 && onStep(x, 0.05)) || !v.some((x) => x > 0)) return null
      return v.map((x) => Math.round(x * 100) / 100)
    },
  },
  sun_req: {
    message: 'sun_req must be 0-72 h in steps of 0.5 h',
    parse(raw) {
      const v = NUMBER.test(raw) ? Number(raw) : NaN
      return v >= 0 && v <= 72 && onStep(v, 0.5) ? v : null
    },
  },
  slope: {
    message: 'slope must be good,bad,max: three values 0-90° in steps of 0.5°, good not above bad',
    parse(raw) {
      const v = numbers(raw, 3)
      return v && v.every((x) => x >= 0 && x <= 90 && onStep(x, 0.5)) && v[0] <= v[1] ? v : null
    },
  },
  psr: {
    message: 'psr must be 0 or 1',
    parse: (raw) => (raw === '0' ? false : raw === '1' ? true : null),
  },
  margin: {
    message: 'margin must be whole hours 0-48',
    parse(raw) {
      const v = /^\d+$/.test(raw) ? Number(raw) : NaN
      return v <= 48 ? v : null
    },
  },
  colors: {
    message: 'colors must be green,amber: two whole numbers 0-100, amber not above green',
    parse(raw) {
      const v = numbers(raw, 2)
      return v && v.every((x) => x >= 0 && x <= 100 && Number.isInteger(x)) && v[1] <= v[0] ? v : null
    },
  },
}

/** Each key on its own: the value, the default when absent, or the key named in `invalid`. */
export function readScoreSettings(params: URLSearchParams): { settings: ScoreSettings; invalid: SettingKey[] } {
  const settings: Record<string, unknown> = { ...SCORE_DEFAULTS }
  const invalid: SettingKey[] = []
  for (const key of SETTING_KEYS) {
    const raw = params.get(key)
    if (raw === null) continue
    const value = SETTING_RULES[key].parse(raw)
    if (value === null) invalid.push(key)
    else settings[key] = value
  }
  return { settings: settings as unknown as ScoreSettings, invalid }
}

/** Invalid or outdated values (an old 4-weight `w`) fall back to the key's default. */
export function parseScoreSettings(search: string): ScoreSettings {
  return readScoreSettings(new URLSearchParams(search)).settings
}

function text(key: SettingKey, s: ScoreSettings): string {
  switch (key) {
    case 'w':
    case 'slope':
    case 'colors':
      return list(s[key])
    case 'psr':
      return s.psr ? '1' : '0'
    default:
      return canon(s[key])
  }
}

export function isCustom(s: ScoreSettings): boolean {
  return SETTING_KEYS.some((key) => text(key, s) !== text(key, SCORE_DEFAULTS))
}

/** Writes only non-default settings, in a fixed order, so equal settings give equal URLs. */
export function serializeScoreSettings(s: ScoreSettings, base = ''): string {
  const params = new URLSearchParams(base)
  for (const key of SETTING_KEYS) {
    params.delete(key)
    if (text(key, s) !== text(key, SCORE_DEFAULTS)) params.set(key, text(key, s))
  }
  // Commas stay readable; they are safe in a query string.
  const out = params.toString().replaceAll('%2C', ',')
  return out === '' ? '' : `?${out}`
}

/** The API query always carries every setting. */
export function settingsQuery(s: ScoreSettings) {
  return {
    w: list(s.w),
    sun_req: Number(canon(s.sun_req)),
    slope: list(s.slope),
    psr: (s.psr ? 1 : 0) as 0 | 1,
    margin: s.margin,
    colors: list(s.colors),
  }
}
