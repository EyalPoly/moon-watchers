// The guide's score suggestions: checked against the same rule the server uses for `w`
// (seven weights 0-1 in steps of 0.05, at least one above 0) before anything is applied.

import { SETTING_RULES, WEIGHT_PRESETS, type ScoreSettings } from '../api/scoreSettings'
import { WEIGHT_IDS, type Intent } from './intent'

export const WEIGHT_LABELS: Record<(typeof WEIGHT_IDS)[number], string> = {
  L: 'sunlight',
  C: 'station contact',
  DK: 'longest darkness',
  OT: 'longest outage',
  LS: 'sunlight at landing',
  S: 'slope',
  D: 'lunar regolith (simulated)',
}

export type ScoreAdvice =
  | { ok: true; settings: ScoreSettings; changes: { id: string; label: string; from: number; to: number }[]; preset: string | null }
  | { ok: false; reason: string }

const step = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 20) / 20

/** New settings from the guide's weights or preset; everything except the weights stays. */
export function adviseScore(intent: Intent, current: ScoreSettings): ScoreAdvice {
  let weights: number[]
  let preset: string | null = null
  const named = intent.preset ? WEIGHT_PRESETS.find((p) => p.id === intent.preset || p.name.toLowerCase() === intent.preset?.toLowerCase()) : undefined
  if (named) {
    weights = [...named.weights]
    preset = named.name
  } else if (intent.weights) {
    weights = WEIGHT_IDS.map((id, i) => {
      const v = intent.weights?.[id]
      return v === undefined ? current.w[i] : step(v)
    })
  } else {
    return { ok: false, reason: 'The suggestion had no weights.' }
  }
  const parsed = SETTING_RULES.w.parse(weights.join(','))
  if (parsed === null) return { ok: false, reason: 'At least one weight must be above 0.' }
  const w = parsed as ScoreSettings['w']
  const changes = WEIGHT_IDS.flatMap((id, i) =>
    Math.abs(w[i] - current.w[i]) > 1e-9 ? [{ id, label: WEIGHT_LABELS[id], from: current.w[i], to: w[i] }] : [],
  )
  return { ok: true, settings: { ...current, w }, changes, preset }
}

const fmt = (v: number) => v.toFixed(2)

/** "sunlight 0.25 → 0.40, station contact 0.25 → 0.10" */
export function describeChanges(changes: { label: string; from: number; to: number }[]): string {
  return changes.length === 0 ? 'no change to the current weights' : changes.map((c) => `${c.label} ${fmt(c.from)} → ${fmt(c.to)}`).join(', ')
}
