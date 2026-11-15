import type { Summary } from '../api/types'

type Score = Summary['score']

const ICON: Record<Score['category'], string> = { green: '✓', amber: '!', red: '✕', excluded: '⊘' }
const WORD: Record<Score['category'], string> = { green: 'good', amber: 'marginal', red: 'poor', excluded: 'excluded' }

const FACTOR: Record<Score['factors'][number]['name'], { label: string; unit: string }> = {
  L: { label: 'sunlight', unit: '' },
  C: { label: 'station contact', unit: '' },
  DK: { label: 'longest darkness', unit: ' h' },
  OT: { label: 'longest outage', unit: ' h' },
  LS: { label: 'sunlight at landing', unit: ' h' },
  S: { label: 'slope', unit: '°' },
  D: { label: 'dust: simulated', unit: '' },
}

export const ILLUSTRATIVE_NOTE = 'Illustrative weights and thresholds, not validated landing criteria'

function badge(score: Score): string | null {
  if (score.excluded_reason === 'psr') return 'excluded: inside a PSR'
  if (score.excluded_reason === 'slope') return `excluded: slope above ${score.settings.slope_deg[2]}°`
  if (score.warnings.some((w) => w.code.startsWith('NULL_GRADE'))) return 'score uses missing data'
  return null
}

function breakdown(score: Score): string {
  const lines = score.factors.map((f) => {
    const { label, unit } = FACTOR[f.name]
    const raw = f.raw === null ? 'unavailable' : `${Number(f.raw.toFixed(2))}${unit}`
    return `${label}: ${raw}, grade ${f.grade.toFixed(2)}, weight ${(f.weight_share * 100).toFixed(0)}%, ${f.points_lost.toFixed(1)} pts lost`
  })
  const deciding = score.deciding.length > 0 ? `Deciding: ${score.deciding.map((d) => FACTOR[d].label).join(', ')}` : null
  return [`Score ${score.value.toFixed(1)} / 100`, ...lines, deciding, score.explanation, score.formula].filter(Boolean).join('\n')
}

export function ScoreBox({ score }: { score: Score }) {
  const note = badge(score)
  return (
    <div className="score-box">
      <span
        className={`score score-${score.category}`}
        title={breakdown(score)}
        tabIndex={0}
        aria-label={`Score ${score.value.toFixed(1)} of 100, ${WORD[score.category]}. ${breakdown(score)}`}
      >
        <span className="score-icon" aria-hidden="true">
          {ICON[score.category]}
        </span>
        <span className="num">{score.value.toFixed(score.value === 100 ? 0 : 1)}</span>
        <span className="score-label">score</span>
      </span>
      <div className="score-text">
        {note && <span className={`score-badge${score.category === 'excluded' ? ' score-badge-excluded' : ''}`}>{note}</span>}
        {score.settings.custom && <span className="score-badge score-badge-custom">custom settings</span>}
        <span className="score-note">{ILLUSTRATIVE_NOTE}</span>
      </div>
    </div>
  )
}
