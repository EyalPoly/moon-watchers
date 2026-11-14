import { SampleBanner } from './SampleBanner'

// Top strip from the UI team's corrections: logo on the left, screen tabs on the right
// that look like tabs (green text and underline when active), no date or time here.
const TABS = [
  { id: 'orbit', label: 'Orbit', ready: false },
  { id: 'south_pole', label: 'South pole', ready: true },
  { id: 'surface', label: 'Surface', ready: false },
  { id: 'timelines', label: 'Timelines', ready: false },
] as const

export function TopBar({ sample }: { sample: boolean }) {
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
    </header>
  )
}
