import type { RagColor, Summary } from '../api/types'
import { ScoreBox } from './ScoreBox'

// Feasibility colors always come with an icon (spec §9.4), so color is never the only cue.
const ICON: Record<RagColor, string> = { green: '✓', amber: '!', red: '✕', unknown: '?' }
const WORD: Record<RagColor, string> = { green: 'good', amber: 'marginal', red: 'poor', unknown: 'unavailable' }
const UNAVAILABLE = 'unavailable'
const percent = (v: number | null) => (v === null ? UNAVAILABLE : `${v.toFixed(0)}%`)
const hours = (v: number | null) => (v === null ? UNAVAILABLE : `${v.toFixed(0)} h`)
const fraction = (v: number | null) => (v === null ? UNAVAILABLE : `${(v * 100).toFixed(0)}%`)

function Chip({ label, value, color, reason }: { label: string; value: string; color: RagColor; reason: string }) {
  return (
    <span className={`chip chip-${color}`} title={reason} aria-label={color === 'unknown' ? `${label}: ${UNAVAILABLE}. ${reason}` : `${label}: ${value}, ${WORD[color]}. ${reason}`}>
      <span className="chip-icon" aria-hidden="true">
        {ICON[color]}
      </span>
      {label} <span className="num">{value}</span>
    </span>
  )
}

export function VerdictChips({ summary, slopeDeg }: { summary: Summary; slopeDeg: number }) {
  const { rag, metrics, score } = summary
  return (
    <div className="verdict">
      <ScoreBox score={score} />
      <div className="chips">
        <Chip label="Sun" value={percent(metrics.sun_pct)} color={rag.sun.color} reason={rag.sun.reason} />
        <Chip label="Earth" value={percent(metrics.dte_pct)} color={rag.dte.color} reason={rag.dte.reason} />
        <Chip label="Slope" value={`${slopeDeg.toFixed(1)}°`} color={rag.slope.color} reason={rag.slope.reason} />
      </div>
    </div>
  )
}

export function MissionMetrics({ summary }: { summary: Summary }) {
  const m = summary.metrics
  const unknownReason = `terrain unknown for ${Number(m.unknown_h.toFixed(1))} h`
  const rows: { label: string; value: string; known: boolean }[] = [
    { label: 'Sun + Earth together', value: percent(m.both_pct), known: m.both_pct !== null },
    { label: 'Sunlight (L)', value: fraction(m.sun_disk_mean), known: m.sun_disk_mean !== null },
    { label: 'Station contact (C)', value: fraction(m.contact_mean), known: m.contact_mean !== null },
    { label: 'Earth above horizon', value: percent(m.earth_any_pct), known: m.earth_any_pct !== null },
    { label: 'Longest darkness', value: hours(m.longest_dark_h), known: true },
    { label: 'Longest comm gap', value: hours(m.longest_no_contact_h), known: true },
    { label: 'First sunlight', value: hours(m.first_sun_h), known: m.first_sun_h !== null },
    {
      label: 'First dark after landing',
      value: m.first_dark_after_landing_h === null ? UNAVAILABLE : m.first_dark_after_landing_h === 0 ? 'lands in dark' : `${m.first_dark_after_landing_h.toFixed(0)} h`,
      known: m.first_dark_after_landing_h !== null,
    },
  ]
  return (
    <dl className="metrics">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd className="num">{r.value}</dd>
          {!r.known && <dd className="metric-reason">{unknownReason}</dd>}
        </div>
      ))}
    </dl>
  )
}
