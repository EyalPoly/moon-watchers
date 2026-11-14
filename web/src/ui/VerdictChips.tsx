import type { RagColor, Summary } from '../api/types'

// Feasibility colors always come with an icon (spec §9.4), so color is never the only cue.
const ICON: Record<RagColor, string> = { green: '✓', amber: '!', red: '✕', unknown: '?' }
const WORD: Record<RagColor, string> = { green: 'good', amber: 'marginal', red: 'poor', unknown: 'unavailable' }
const percent = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(0)}%`)

function Chip({ label, value, color, reason }: { label: string; value: string; color: RagColor; reason: string }) {
  return (
    <span className={`chip chip-${color}`} title={reason} aria-label={`${label}: ${value}, ${WORD[color]}. ${reason}`}>
      <span className="chip-icon" aria-hidden="true">
        {ICON[color]}
      </span>
      {label} <span className="num">{value}</span>
    </span>
  )
}

export function VerdictChips({ summary, slopeDeg }: { summary: Summary; slopeDeg: number }) {
  const { rag, metrics, score } = summary
  const breakdown = [
    `Score ${score.value.toFixed(0)} / 100`,
    ...score.factors.map((f) => `${f.name}: ${f.points_lost.toFixed(1)} pts lost`),
    score.explanation,
    score.formula,
  ].join('\n')
  return (
    <div className="verdict">
      <span className={`score score-${score.category}`} title={breakdown}>
        <span className="num">{score.value.toFixed(0)}</span>
        <span className="score-label">score</span>
      </span>
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
  return (
    <dl className="metrics">
      <div>
        <dt>Sun + Earth together</dt>
        <dd className="num">{percent(m.both_pct)}</dd>
      </div>
      <div>
        <dt>Longest darkness</dt>
        <dd className="num">{m.longest_dark_h.toFixed(0)} h</dd>
      </div>
      <div>
        <dt>Longest comm gap</dt>
        <dd className="num">{m.longest_no_contact_h.toFixed(0)} h</dd>
      </div>
      <div>
        <dt>First dark after landing</dt>
        <dd className="num">{m.first_dark_after_landing_h === null ? 'n/a' : m.first_dark_after_landing_h === 0 ? 'lands in dark' : `${m.first_dark_after_landing_h.toFixed(0)} h`}</dd>
      </div>
    </dl>
  )
}
