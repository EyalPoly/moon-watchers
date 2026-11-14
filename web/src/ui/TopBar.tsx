import { useState } from 'react'
import { isCustom, type ScoreSettings } from '../api/scoreSettings'
import type { Meta } from '../api/types'
import { SampleBanner } from './SampleBanner'
import { ScoreSettingsPanel } from './ScoreSettingsPanel'

// Top strip from the UI team's corrections: logo on the left, screen tabs on the right
// that look like tabs (green text and underline when active), no date or time here.
const TABS = [
  { id: 'orbit', label: 'Orbit', ready: false },
  { id: 'south_pole', label: 'South pole', ready: true },
  { id: 'surface', label: 'Surface', ready: false },
  { id: 'timelines', label: 'Timelines', ready: false },
] as const

export interface TopBarProps {
  sample: boolean
  /** Undefined until the server's score description arrives. */
  scoreSpec: Meta['score'] | undefined
  settings: ScoreSettings
  onSettingsChange: (s: ScoreSettings) => void
  onSettingsCommit: (s: ScoreSettings) => void
}

export function TopBar({ sample, scoreSpec, settings, onSettingsChange, onSettingsCommit }: TopBarProps) {
  const [open, setOpen] = useState(false)
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-name">moon watchers</span>
        <span className="brand-by">by menasim</span>
      </div>
      <SampleBanner visible={sample} />
      <nav className="tabs" aria-label="Screens">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === 'south_pole' ? 'tab tab-active' : 'tab'}
            aria-current={tab.id === 'south_pole' ? 'page' : undefined}
            disabled={!tab.ready}
            title={tab.ready ? undefined : `${tab.label}: coming soon`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="settings-anchor">
        <button
          type="button"
          className="secondary"
          aria-expanded={open && scoreSpec !== undefined}
          aria-controls="score-settings"
          disabled={scoreSpec === undefined}
          onClick={() => setOpen((o) => !o)}
        >
          {isCustom(settings) ? 'Score settings (custom)' : 'Score settings'}
        </button>
        {open && scoreSpec && (
          <section id="score-settings" className="settings-panel" role="dialog" aria-label="Score settings">
            <div className="settings-panel-head">
              <strong>Score settings</strong>
              <button type="button" className="link-button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <ScoreSettingsPanel
              spec={scoreSpec}
              value={settings}
              onChange={onSettingsChange}
              onCommit={onSettingsCommit}
            />
          </section>
        )}
      </div>
    </header>
  )
}
