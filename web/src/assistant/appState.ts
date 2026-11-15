// What the guide is told about the screen: each site card with its settings and, once
// computed, its score breakdown, chips, metrics and warnings. All of it is the app's own
// results, so the guide can explain numbers without computing any.

import { isCustom, type ScoreSettings } from '../api/scoreSettings'
import type { AppScreen } from '../state/screen'
import type { Site, Summary } from '../api/types'
import { WEIGHT_IDS } from './intent'
import { WEIGHT_LABELS } from './scoreAdvice'

export interface CardState {
  letter: string
  name: string
  site: Site | undefined
  t0: string
  days: number
  panel: number
  antenna: number
  station: string
  shown: boolean
  summary: Summary | undefined
  /** True while the summary is still loading; false when it failed or there is no site. */
  pending: boolean
}

export interface ViewState {
  screen: AppScreen
  explorer: 'map' | 'graph'
  regionToolOpen: boolean
  activeLetter: string
  cards: readonly CardState[]
  settings: ScoreSettings
}

const n = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? 'unavailable' : String(Number(v.toFixed(digits))))

function describeCard(c: CardState): string {
  const head = `${c.letter}: ${c.name}${c.shown ? '' : ' (hidden in the explorer)'}`
  if (!c.site) return `${head}. No location yet (a draft).`
  const s = c.site
  const where = `${s.source === 'custom' ? 'custom point' : `catalog site ${s.id}`}, ${n(s.lat_deg, 3)}°, ${n(s.lon_deg, 3)}°E, elevation ${n(s.elevation_m, 0)} m, slope ${n(s.slope_deg)}°${s.category ? `, ${s.category}` : ''}`
  const scenario = `landing ${c.t0}, ${c.days} days, panel ${c.panel} m, antenna ${c.antenna} m, station ${c.station}`
  const lines = [`${head}. ${where}. Scenario: ${scenario}.`]
  const sum = c.summary
  if (!sum) {
    lines.push(c.pending ? '  Results: still computing.' : '  Results: unavailable (the server did not answer).')
    return lines.join('\n')
  }
  const sc = sum.score
  const m = sum.metrics
  lines.push(
    `  Score ${sc.value === null ? 'unavailable' : n(sc.value)} / 100, ${sc.category}${sc.excluded_reason ? ` (excluded: ${sc.excluded_reason})` : ''}. ${sc.explanation}`,
  )
  lines.push(
    '  Factors (raw value, grade 0-1, weight share, points lost): ' +
      sc.factors.map((f) => `${f.name} ${WEIGHT_LABELS[f.name]}: ${f.raw === null ? 'unavailable' : n(f.raw, 3)}, ${n(f.grade, 2)}, ${n(f.weight_share, 2)}, ${n(f.points_lost)}`).join('; '),
  )
  lines.push(`  Chips: Sun ${sum.rag.sun.color} (${sum.rag.sun.reason}); Earth ${sum.rag.dte.color} (${sum.rag.dte.reason}); Slope ${sum.rag.slope.color} (${sum.rag.slope.reason}).`)
  lines.push(
    `  Metrics: Sun ${n(m.sun_pct)}%, Earth contact ${n(m.dte_pct)}%, both ${n(m.both_pct)}%, sunlight L ${n(m.sun_disk_mean, 3)}, contact C ${n(m.contact_mean, 3)}, longest darkness ${n(m.longest_dark_h)} h, longest comm gap ${n(m.longest_no_contact_h)} h, first sunlight ${n(m.first_sun_h)} h, first dark after landing ${n(m.first_dark_after_landing_h)} h, unknown ${n(m.unknown_h)} h.`,
  )
  const warnings = [...sum.warnings, ...sc.warnings.filter((w) => !sum.warnings.some((x) => x.code === w.code))]
  lines.push(`  Warnings: ${warnings.length === 0 ? 'none' : warnings.map((w) => `${w.code} [${w.severity}]: ${w.text}`).join(' | ')}`)
  return lines.join('\n')
}

export function describeAppState(v: ViewState): string {
  const w = WEIGHT_IDS.map((id, i) => `${id} ${v.settings.w[i]}`).join(', ')
  const s = v.settings
  return [
    `Screen: ${v.screen === 'timelines' ? 'Timelines' : v.screen === 'orbit' ? 'Orbit' : `South pole (explorer shows the ${v.explorer === 'map' ? 'map' : 'ridge graph'})`}. Manual Selection tool: ${v.regionToolOpen ? 'open' : 'closed'}. Open card: ${v.activeLetter}.`,
    `Score settings${isCustom(s) ? ' (custom)' : ' (defaults)'}: weights ${w}; required sunlight at landing ${s.sun_req} h; slope good ${s.slope[0]}°, bad ${s.slope[1]}°, max ${s.slope[2]}°; reject PSR ${s.psr ? 'on' : 'off'}; landing margin ${s.margin} h; colors green ≥ ${s.colors[0]}, amber ≥ ${s.colors[1]}.`,
    `Site cards (${v.cards.length}):`,
    ...v.cards.map(describeCard),
  ].join('\n')
}
