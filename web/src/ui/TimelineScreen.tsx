import { useMemo, type CSSProperties, type MouseEvent } from 'react'
import type { AppConfig } from '../api/config'
import type { ScoreSettings } from '../api/scoreSettings'
import type { Scenario, Site, Summary } from '../api/types'
import { useSummaries } from '../state/queries'
import { toScenario } from '../state/scenario'
import type { Ticket } from '../state/tickets'
import { barMinutes, dayTicks, windowsToBars, type Bar } from '../timeline/bars'
import { formatDuration, formatUtc, parseIsoMinute } from '../time'
import { CompareView } from './CompareView'
import { pointLetter, siteDisplayName } from './points'
import { ScoreBox } from './ScoreBox'
import { ticketVars } from './ticketStyle'
import { TimeSlider } from './TimeSlider'

// Screen 4: one panel per site, rows of Sun / Earth contact / both / unknown terrain on a
// shared mission-day axis, the score beside them and the comparison table below.

export interface TimelineScreenProps {
  tickets: readonly Ticket[]
  sitesById: ReadonlyMap<string, Site>
  config: AppConfig
  search: string
  settings: ScoreSettings
  isSample: boolean
  /** Mission elapsed time being viewed, in minutes. */
  tau: number
  onTauInput: (tau: number) => void
  onTauCommit: (tau: number) => void
  onBack: () => void
  onOpenTicket: (index: number) => void
}

type RowKey = 'sun' | 'dte' | 'both' | 'unknown'

const ROWS: { key: RowKey; label: string; share: (m: Summary['metrics']) => string }[] = [
  { key: 'sun', label: 'Sun visible', share: (m) => pct(m.sun_pct) },
  { key: 'dte', label: 'Earth contact', share: (m) => pct(m.dte_pct) },
  { key: 'both', label: 'Sun + Earth', share: (m) => pct(m.both_pct) },
  { key: 'unknown', label: 'Unknown terrain', share: (m) => (m.unknown_h > 0 ? `${Number(m.unknown_h.toFixed(1))} h` : 'none') },
]

const pct = (v: number | null) => (v === null ? 'unavailable' : `${v.toFixed(0)}%`)
const at = (minutes: number, total: number) => `${(minutes / total) * 100}%`

function barTitle(label: string, b: Bar): string {
  return `${label}: ${formatUtc(b.startMs)} → ${formatUtc(b.endMs)} (${formatDuration(b.endMs - b.startMs)}), day ${(b.start / 1440).toFixed(1)} to ${(b.end / 1440).toFixed(1)}`
}

export function TimelineScreen(props: TimelineScreenProps) {
  const { tickets, sitesById, config, search, settings, tau } = props
  const columns = useMemo(
    () =>
      tickets.flatMap((t, index) => {
        const site = t.site === null ? undefined : sitesById.get(t.site)
        if (!site || !t.shown) return []
        const scenario: Scenario = toScenario(site.id, t, t.station, settings)
        return [{ index, ticket: t, site, scenario }]
      }),
    [tickets, sitesById, settings],
  )
  const scenarios = useMemo(() => columns.map((c) => c.scenario), [columns])
  const results = useSummaries(config, search, scenarios)

  const totalDays = Math.max(1, ...columns.map((c) => c.ticket.days))
  const totalMin = Math.floor((totalDays * 1440) / 10) * 10
  const ticks = dayTicks(totalDays)
  const viewed = Math.min(tau, totalMin)
  const landingMs = columns.length > 0 ? (parseIsoMinute(columns[0].ticket.t0) ?? 0) : 0

  /** A click on a track moves the viewed time there, on the 10-minute grid. */
  const seek = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const share = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    props.onTauCommit(Math.round((share * totalMin) / 10) * 10)
  }

  return (
    <main className="timelines" aria-label="Timelines">
      <header className="tl-head">
        <div>
          <p className="eyebrow mono">04&nbsp;&nbsp;/&nbsp;&nbsp;TIMELINES</p>
          <h1>Mission timelines</h1>
        </div>
        {columns.length > 0 && (
          <div className="tl-slider">
            <TimeSlider tau={viewed} maxTau={totalMin} landingMs={landingMs} onInput={props.onTauInput} onCommit={props.onTauCommit} />
          </div>
        )}
      </header>

      {columns.length === 0 ? (
        <div className="panels-empty">
          <p>No sites to show. Add sites with a location on the South pole screen, and keep them shown in the explorer.</p>
          <button type="button" className="secondary" onClick={props.onBack}>Go to the South pole screen</button>
        </div>
      ) : (
        <>
          <div className="tl-chart" role="group" aria-label="Sunlight and Earth contact by mission day">
            <div className="tl-axis" aria-hidden="true">
              <span className="tl-axis-label mono">MISSION DAY</span>
              <div className="tl-ticks">
                {ticks.map((d) => (
                  <span key={d} className="tl-tick num" style={{ left: at(d * 1440, totalMin) }}>{d}</span>
                ))}
              </div>
            </div>

            {columns.map((c, k) => {
              const summary = results[k]?.data
              const failed = results[k]?.isError
              return (
                <section key={c.index} className="tl-site" style={ticketVars(c.index)} aria-label={`Site ${pointLetter(c.index)} timeline`}>
                  <div className="tl-side">
                    <button type="button" className="tl-name" onClick={() => props.onOpenTicket(c.index)} title="Open this site on the South pole screen">
                      <span className="badge">{pointLetter(c.index)}</span>
                      <span>{c.ticket.name || siteDisplayName(c.site)}</span>
                    </button>
                    <span className="tl-when num">
                      {formatUtc(parseIsoMinute(c.ticket.t0) ?? 0)} · {c.ticket.days} d
                    </span>
                    {summary ? <ScoreBox score={summary.score} /> : <span className="muted">{failed ? 'Server unavailable' : 'Loading…'}</span>}
                  </div>
                  <div className="tl-rows">
                    {ROWS.map((row) => {
                      const bars = summary ? windowsToBars(summary.windows[row.key], c.ticket.t0, c.ticket.days) : []
                      const share = summary ? row.share(summary.metrics) : '…'
                      return (
                        <div key={row.key} className="tl-row">
                          <span className="tl-label">
                            {row.label}
                            <span className="tl-share num">{share}</span>
                          </span>
                          <div
                            className={`tl-track tl-${row.key}`}
                            onClick={seek}
                            role="img"
                            aria-label={`${row.label}: ${bars.length} ${bars.length === 1 ? 'period' : 'periods'}, ${formatDuration(barMinutes(bars) * 60_000)} in all`}
                          >
                            {ticks.map((d) => d > 0 && <span key={d} className="tl-grid" style={{ left: at(d * 1440, totalMin) }} />)}
                            {/* Days past this site's own mission end. */}
                            {c.ticket.days < totalDays && (
                              <span className="tl-after" style={{ left: at(c.ticket.days * 1440, totalMin) }} />
                            )}
                            {bars.map((b) => (
                              <span
                                key={b.startMs}
                                className="tl-bar"
                                style={{ left: at(b.start, totalMin), width: at(b.end - b.start, totalMin) } as CSSProperties}
                                title={barTitle(row.label, b)}
                              />
                            ))}
                            {summary && bars.length === 0 && <span className="tl-none">{row.key === 'unknown' ? '' : 'never during the mission'}</span>}
                          </div>
                        </div>
                      )
                    })}
                    <span className="tl-now" style={{ '--at': viewed / totalMin } as CSSProperties} aria-hidden="true" />
                  </div>
                </section>
              )
            })}

            <ul className="tl-legend" aria-label="Key">
              <li><span className="tl-swatch tl-sun" /> Sun visible</li>
              <li><span className="tl-swatch tl-dte" /> Earth contact</li>
              <li><span className="tl-swatch tl-both" /> Sun + Earth together</li>
              <li><span className="tl-swatch tl-unknown" /> Unknown terrain</li>
              <li><span className="tl-swatch tl-swatch-now" /> Viewed time</li>
              <li><span className="tl-swatch tl-swatch-after" /> After this site’s mission</li>
            </ul>
          </div>

          <CompareView
            tickets={tickets}
            sitesById={sitesById}
            config={config}
            search={search}
            settings={settings}
            isSample={props.isSample}
            onClose={props.onBack}
            onOpenTicket={props.onOpenTicket}
          />
        </>
      )}
    </main>
  )
}
