// The score formula for sample data. It follows the engine's, so the settings panel works
// without a server; a Python test recomputes each committed sample with the engine.

import meta from '@samples/meta.json'
import { isCustom, type ScoreSettings } from '../scoreSettings'
import type { ApiWarning, GradeId, Summary } from '../types'

export type { GradeId }

export const GRADE_IDS: readonly GradeId[] = ['L', 'C', 'DK', 'OT', 'LS', 'S', 'D']
const GRADES = meta.score.grades as readonly { id: GradeId; name: string; label: string; raw_label: string; raw_unit: string }[]
const CATALOG = meta.warning_catalog as readonly (Omit<ApiWarning, 'text'> & { text: string; standing: boolean })[]

const PENALTY_TIE = 1e-9
const NO_PENALTY = 1e-10

const clip = (v: number) => Math.min(1, Math.max(0, v))
const round = (v: number, decimals: number) => Math.round(v * 10 ** decimals) / 10 ** decimals

/** One catalog entry with its placeholders filled; `NULL_GRADE:light` uses the `NULL_GRADE` entry. */
export function makeWarning(code: string, fill: Record<string, string> = {}): ApiWarning {
  const entry = CATALOG.find((e) => e.code === code.split(':')[0])
  if (!entry) throw new Error(`unknown warning code ${code}`)
  const text = entry.text.replace(/\{(\w+)\}/g, (_, name: string) => fill[name] ?? `{${name}}`)
  return { code, text, severity: entry.severity, affects: entry.affects }
}

const SEVERITY_RANK = { blocking: 0, caution: 1, info: 2 }

/** Blocking first, then caution, then info, each in catalog order; repeated codes once. */
export function sortWarnings(items: readonly ApiWarning[]): ApiWarning[] {
  const unique = [...new Map(items.map((w) => [w.code, w])).values()]
  const order = (w: ApiWarning) => CATALOG.findIndex((e) => e.code === w.code.split(':')[0])
  return unique.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || order(a) - order(b))
}

function grades(raw: Record<GradeId, number | null>, slopeDeg: number, windowH: number, s: ScoreSettings) {
  const [good, bad] = s.slope
  const fraction = (hours: number | null) => (hours === null ? null : clip(1 - hours / windowH))
  return {
    L: raw.L,
    C: raw.C,
    DK: fraction(raw.DK),
    OT: fraction(raw.OT),
    LS: raw.LS === null ? null : raw.LS >= s.sun_req ? 1 : 0,
    S: bad === good ? (slopeDeg <= good ? 1 : 0) : clip((bad - slopeDeg) / (bad - good)),
    D: raw.D === null ? null : clip(1 - raw.D),
  } satisfies Record<GradeId, number | null>
}

const rawText = (id: GradeId, raw: number | null) => {
  const grade = GRADES.find((g) => g.id === id) as (typeof GRADES)[number]
  return `${grade.raw_label} ${raw === null ? 'unavailable' : `${round(raw, 2)}${grade.raw_unit}`}`
}
const labelOf = (id: GradeId) => (GRADES.find((g) => g.id === id) as (typeof GRADES)[number]).label

export function mockScore(
  raw: Record<GradeId, number | null>,
  slopeDeg: number,
  inPsr: boolean | null,
  s: ScoreSettings,
  windowH: number,
): Summary['score'] {
  const total = s.w.reduce((a, b) => a + b, 0)
  const known = grades(raw, slopeDeg, windowH, s)
  const excludedBy = s.psr && inPsr === true ? 'psr' : slopeDeg > s.slope[2] ? 'slope' : null
  const used = Object.fromEntries(
    GRADE_IDS.map((id) => [id, excludedBy === 'psr' ? 0 : (known[id] ?? 0)]),
  ) as Record<GradeId, number>

  const penalty = (id: GradeId) => 100 * (s.w[GRADE_IDS.indexOf(id)] / total) * (1 - used[id])
  const penalties = GRADE_IDS.map(penalty)
  const sum = 100 * GRADE_IDS.reduce((a, id, i) => a + (s.w[i] / total) * used[id], 0)
  const value = excludedBy === null ? round(sum, 1) : 0
  const category: Summary['score']['category'] =
    excludedBy !== null ? 'excluded' : value >= s.colors[0] ? 'green' : value >= s.colors[1] ? 'amber' : 'red'

  const biggest = Math.max(...penalties)
  const deciding =
    excludedBy !== null || biggest <= NO_PENALTY ? [] : GRADE_IDS.filter((_, i) => Math.abs(penalties[i] - biggest) <= PENALTY_TIE)

  const nulls = GRADE_IDS.filter((id, i) => known[id] === null && s.w[i] > 0)
  const codes: ApiWarning[] = [
    ...nulls.map((id) => makeWarning(`NULL_GRADE:${GRADES.find((g) => g.id === id)?.name}`, { label: labelOf(id).replace(/^./, (c) => c.toUpperCase()) })),
    ...(s.psr && inPsr === null ? [makeWarning('PSR_UNKNOWN')] : []),
    ...(excludedBy === 'psr' ? [makeWarning('EXCLUDED_PSR')] : []),
    ...(excludedBy === 'slope' ? [makeWarning('EXCLUDED_SLOPE', { slope: String(slopeDeg), max: String(s.slope[2]) })] : []),
  ]
  const warnings = sortWarnings(codes)

  const explanation = [
    excludedBy !== null
      ? (warnings.find((w) => w.severity === 'blocking') as ApiWarning).text
      : deciding.length === 0
        ? 'No grade lost points.'
        : deciding.length === 1
          ? `Deciding factor: ${labelOf(deciding[0])} (${rawText(deciding[0], raw[deciding[0]])}; weight share ${round(s.w[GRADE_IDS.indexOf(deciding[0])] / total, 4)}; lost ${round(penalty(deciding[0]), 1)} points).`
          : `Tied deciding factors: ${deciding.map(labelOf).join('; ')}.`,
    ...(nulls.length > 0 ? [`Missing grades counted as 0: ${nulls.map(labelOf).join(', ')}.`] : []),
  ].join(' ')

  const [wL, wC, wDK, wOT, wLS, wS, wD] = s.w
  return {
    value,
    category,
    status: 'illustrative',
    weights: { L: wL, C: wC, DK: wDK, OT: wOT, LS: wLS, S: wS, D: wD },
    factors: GRADE_IDS.map((id, i) => ({
      name: id,
      weight: s.w[i],
      weight_share: round(s.w[i] / total, 4),
      raw: id === 'S' ? slopeDeg : raw[id],
      grade: round(used[id], 4),
      points_lost: round(penalties[i], 2),
    })),
    deciding: [...deciding],
    excluded_reason: excludedBy,
    settings: {
      sun_req_h: s.sun_req,
      slope_deg: s.slope,
      reject_psr: s.psr,
      margin_h: s.margin,
      colors: s.colors,
      custom: isCustom(s),
    },
    warnings,
    explanation,
    formula: meta.score.formula,
  }
}
