import { SampleBanner } from './SampleBanner'
import type { AppScreen } from '../state/screen'

// Top strip (UI design, Moon_Watchers_UI.pdf): logo and team line on the left, screen
// tabs on the right with a green underline on the active one.
const TABS = [
  { id: 'orbit', label: 'Orbit', ready: true },
  { id: 'south_pole', label: 'Site Calculator', ready: true },
  { id: 'surface', label: 'Surface', ready: false },
  { id: 'timelines', label: 'Timelines', ready: true },
] as const

function Logo() {
  return (
    <svg className="brand-logo" viewBox="0 0 40 40" width="34" height="34" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="20" cy="20" r="10" />
      <ellipse cx="20" cy="20" rx="18" ry="6.5" transform="rotate(-28 20 20)" />
    </svg>
  )
}

export function TopBar({ sample, current, onScreen }: {
  sample: boolean
  current: AppScreen
  onScreen: (next: AppScreen) => void
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div>
          <div className="brand-name">Moon Watchers</div>
          <div className="brand-by">by Menasim to the Moon team</div>
        </div>
      </div>
      <SampleBanner visible={sample} />
      <nav className="tabs" aria-label="Screens">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === current ? 'tab tab-active' : 'tab'}
            aria-current={tab.id === current ? 'page' : undefined}
            onClick={tab.ready ? () => onScreen(tab.id) : undefined}
            disabled={!tab.ready}
            title={tab.ready ? undefined : `${tab.label}: coming soon`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
