import type { ScoreSettings } from '../api/scoreSettings'
import type { Meta } from '../api/types'
import type { PanelView } from '../state/tickets'
import { GradingWeights } from './GradingWeights'

function MapIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5Z M5.5 2v10.5M10.5 3.5V14" />
    </svg>
  )
}

function GraphIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M1.5 14.5h13M2 11l3.5-4 3 2.5L14 3" />
    </svg>
  )
}

function LassoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 9c0-3 3-5 7-5s6 2 6 4.5S14 13 10 13c-2 0-3.5-.4-4.5-1" />
      <path d="M5.5 12c-1.2.8-1.5 2.2-.6 3.2.8.9 2.3.9 3.1-.1M8 15.2 7 18" />
    </svg>
  )
}

interface Props {
  view: PanelView
  selecting: boolean
  onView: (view: PanelView) => void
  onRegion: () => void
  scoreSpec: Meta['score']
  settings: ScoreSettings
  onSettingsApply: (settings: ScoreSettings) => void
}

export function ExplorerControls({ view, selecting, onView, onRegion, scoreSpec, settings, onSettingsApply }: Props) {
  return (
    <div className="explorer-controls">
      <div className="view-tabs" role="group" aria-label="Explorer view">
        <button type="button" className={view === 'map' ? 'view-tab view-tab-active' : 'view-tab'}
          aria-pressed={view === 'map'} onClick={() => onView('map')}><MapIcon /> Map View</button>
        <button type="button" className={view === 'graph' ? 'view-tab view-tab-active' : 'view-tab'}
          aria-pressed={view === 'graph'} onClick={() => onView('graph')}><GraphIcon /> Ridge Graph</button>
      </div>
      <div className="explorer-actions">
        <GradingWeights spec={scoreSpec} settings={settings} onApply={onSettingsApply} />
        <button type="button" className={selecting ? 'freehand freehand-on' : 'freehand'}
          aria-pressed={selecting} onClick={onRegion}><LassoIcon /> Manual Selection</button>
      </div>
    </div>
  )
}
