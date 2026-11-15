import { useState } from 'react'
import type { Meta, Summary } from '../api/types'

type Warning = Summary['warnings'][number]
type WarningEntry = Meta['warning_catalog'][number]

const ORDER: Record<Warning['severity'], number> = { blocking: 0, caution: 1, info: 2 }
const ICON: Record<Warning['severity'], string> = { blocking: '⊘', caution: '▲', info: 'ⓘ' }

const baseCode = (code: string) => code.split(':')[0]

function Item({ w, known }: { w: Warning; known: boolean }) {
  return (
    <li className={`warning warning-${w.severity}`}>
      <span className="warning-icon" aria-hidden="true">
        {ICON[w.severity]}
      </span>
      <span className="visually-hidden">{w.severity}: </span>
      {!known && <code className="warning-code">{w.code}</code>} <span>{w.text}</span>
    </li>
  )
}

export function WarningsStrip({
  warnings,
  catalog,
  visible = 2,
}: {
  warnings: readonly Warning[]
  catalog: readonly WarningEntry[]
  /** How many show in full before "+N more". */
  visible?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [standingOpen, setStandingOpen] = useState(false)
  if (warnings.length === 0) return null

  // Until the catalog arrives nothing can be called unknown; the warnings carry their own text.
  const known = new Set(catalog.map((c) => c.code))
  const isKnown = (code: string) => catalog.length === 0 || known.has(baseCode(code))
  const sorted = [...warnings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
  const shown = expanded ? sorted : sorted.slice(0, visible)
  const hidden = sorted.length - visible
  const standing = catalog.filter((c) => c.standing)

  return (
    <div className="warnings" role="group" aria-label={`Warnings (${warnings.length})`}>
      <ul className="warning-list">
        {shown.map((w) => (
          <Item key={w.code} w={w} known={isKnown(w.code)} />
        ))}
      </ul>
      <div className="warning-actions">
        {hidden > 0 && (
          <button type="button" className="link-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show fewer' : `+${hidden} more`}
          </button>
        )}
        {standing.length > 0 && (
          <button type="button" className="link-button" aria-expanded={standingOpen} onClick={() => setStandingOpen(!standingOpen)}>
            Always true
          </button>
        )}
      </div>
      {standingOpen && (
        <ul className="warning-list warning-standing" aria-label="Always true">
          {standing.map((s) => (
            <li key={s.code} className="warning warning-info">
              <span className="warning-icon" aria-hidden="true">
                {ICON.info}
              </span>
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
