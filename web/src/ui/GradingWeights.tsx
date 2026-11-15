import { useState } from 'react'
import type { Meta } from '../api/types'
import { isCustom, type ScoreSettings } from '../api/scoreSettings'
import { ScoreSettingsPanel } from './ScoreSettingsPanel'

function SlidersIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 4h12M2 8h12M2 12h12" />
      <circle cx="5" cy="4" r="1.6" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.6" fill="currentColor" />
      <circle cx="7" cy="12" r="1.6" fill="currentColor" />
    </svg>
  )
}

interface Props {
  spec: Meta['score']
  settings: ScoreSettings
  onApply: (settings: ScoreSettings) => void
}

export function GradingWeights({ spec, settings, onApply }: Props) {
  const [draft, setDraft] = useState<ScoreSettings | null>(null)
  const open = draft !== null

  return (
    <>
      <button type="button" className={open ? 'freehand freehand-on' : 'freehand'} aria-expanded={open}
        onClick={() => setDraft(open ? null : settings)}>
        <SlidersIcon /> {isCustom(settings) ? 'Grading Weights (custom)' : 'Grading Weights'}
      </button>
      {draft && (
        <form className="area-tool region-settings weights-panel" role="dialog" aria-label="Grading Weights"
          onKeyDown={(e) => { if (e.key === 'Escape') setDraft(null) }}
          onSubmit={(e) => {
            e.preventDefault()
            if (e.currentTarget.querySelector('[aria-invalid="true"], [role="alert"]')) return
            onApply(draft)
            setDraft(null)
          }}>
          <div className="area-tool-head"><strong>Grading Weights</strong>
            <button type="button" className="link-button" onClick={() => setDraft(null)}>Cancel</button></div>
          <ScoreSettingsPanel spec={spec} value={draft} onChange={setDraft} onCommit={setDraft} />
          <button type="submit" className="primary settings-apply">Apply</button>
        </form>
      )}
    </>
  )
}
