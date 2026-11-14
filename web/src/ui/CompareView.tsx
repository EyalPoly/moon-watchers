import { useMemo } from 'react'
import type { AppConfig } from '../api/config'
import type { ScoreSettings } from '../api/scoreSettings'
import type { Scenario, Site, Summary } from '../api/types'
import { useMeta, useSummaries } from '../state/queries'
import { toScenario } from '../state/scenario'
import type { Ticket } from '../state/tickets'
import { formatUtc, parseIsoMinute } from '../time'
import { Pending } from './MissionCard'
import { ServerUnavailable } from './ServerUnavailable'
import { ticketLabel, ticketVars } from './ticketStyle'
import { ILLUSTRATIVE_NOTE } from './ScoreBox'
import { WarningsStrip } from './WarningsStrip'

export interface CompareViewProps {
  tickets: readonly Ticket[]
  sitesById: ReadonlyMap<string, Site>
  config: AppConfig
  search: string
  settings: ScoreSettings
  isSample: boolean
  onClose: () => void
  onOpenTicket: (index: number) => void
}

type Better = 'higher' | 'lower'

interface Row {
  label: string
  value: (s: Summary, site: Site) => number | null
  format: (v: number) => string
  better: Better
  hint: string
}

const ROWS: Row[] = [
  { label: 'Score', value: (s) => s.score.value, format: (v) => v.toFixed(1), better: 'higher', hint: ILLUSTRATIVE_NOTE },
  { label: 'Sun visible', value: (s) => s.metrics.sun_pct, format: (v) => `${v.toFixed(0)}%`, better: 'higher', hint: 'Share of the mission with the Sun above the terrain' },
  { label: 'Earth contact', value: (s) => s.metrics.dte_pct, format: (v) => `${v.toFixed(0)}%`, better: 'higher', hint: 'Share of the mission with the whole Earth above the terrain' },
  { label: 'Sun + Earth together', value: (s) => s.metrics.both_pct, format: (v) => `${v.toFixed(0)}%`, better: 'higher', hint: 'Share of the mission with both at once' },
  { label: 'Longest darkness', value: (s) => s.metrics.longest_dark_h, format: (v) => `${v.toFixed(0)} h`, better: 'lower', hint: 'Longest stretch without sunlight' },
  { label: 'Longest comm gap', value: (s) => s.metrics.longest_no_contact_h, format: (v) => `${v.toFixed(0)} h`, better: 'lower', hint: 'Longest stretch without Earth contact' },
  { label: 'First dark after landing', value: (s) => s.metrics.first_dark_after_landing_h, format: (v) => (v === 0 ? 'lands in dark' : `${v.toFixed(0)} h`), better: 'higher', hint: 'Hours of sunlight before the first darkness' },
  { label: 'Slope', value: (_, site) => site.slope_deg, format: (v) => `${v.toFixed(1)}°`, better: 'lower', hint: 'Terrain slope at the site' },
]

/** Side-by-side comparison of the tickets that have a site. */
export function CompareView({ tickets, sitesById, config, search, settings, isSample, onClose, onOpenTicket }: CompareViewProps) {
  const columns = useMemo(
    () =>
      tickets.flatMap((t, index) => {
        const site = t.site === null ? undefined : sitesById.get(t.site)
        // Only the tickets the user chose to show are compared.
        if (!site || !t.shown) return []
        const scenario: Scenario = toScenario(site.id, t, t.station, settings)
        return [{ index, ticket: t, site, scenario }]
      }),
    [tickets, sitesById, settings],
  )
  const scenarios = useMemo(() => columns.map((c) => c.scenario), [columns])
  const results = useSummaries(config, search, scenarios)
  const catalog = useMeta(config, search).data?.warning_catalog ?? []

  const failed = results.find((r) => r.isError)
  if (failed) return <ServerUnavailable onRetry={() => results.forEach((r) => void r.refetch())} />
  if (results.some((r) => !r.data)) return <Pending label="Comparing tickets…" />
  const summaries = results.map((r) => r.data as Summary)

  const best = (row: Row) => {
    const values = columns.map((c, k) => row.value(summaries[k], c.site))
    const known = values.filter((v): v is number => v !== null)
    // A missing value never wins; the rest are compared among themselves.
    if (known.length < 2) return -1
    const target = row.better === 'higher' ? Math.max(...known) : Math.min(...known)
    // No "best" when every known value ties.
    return known.every((v) => v === target) ? -1 : values.indexOf(target)
  }
  const optimal = best(ROWS[0])

  return (
    <section className="compare" aria-label="Compare tickets">
      <div className="compare-head">
        <h2>Compare tickets</h2>
        <button type="button" className="secondary" onClick={onClose}>
          Back to maps
        </button>
      </div>
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col" />
              {columns.map((c, k) => (
                <th key={c.index} scope="col" style={ticketVars(c.index)}>
                  <button type="button" className="compare-ticket" onClick={() => onOpenTicket(c.index)} title="Open this ticket">
                    <span className="ticket-dot" aria-hidden="true" />
                    {ticketLabel(c.index, c.ticket.name)}
                  </button>
                  <div className="compare-site">{c.site.name}</div>
                  <div className="compare-when num">
                    {formatUtc(parseIsoMinute(c.ticket.t0) as number)} · {c.ticket.days} d · panel {c.ticket.panel} m · antenna {c.ticket.antenna} m
                  </div>
                  {k === optimal && <span className="optimal">Optimal</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const winner = best(row)
              return (
                <tr key={row.label}>
                  <th scope="row" title={row.hint}>
                    {row.label}
                  </th>
                  {columns.map((c, k) => {
                    const v = row.value(summaries[k], c.site)
                    const color = row.label === 'Score' ? summaries[k].score.category : null
                    return (
                      <td key={c.index} className={k === winner ? 'num compare-best' : 'num'}>
                        <span className={color ? `chip-${color}` : undefined}>{v === null ? 'unavailable' : row.format(v)}</span>
                        {k === winner && <span className="best-mark" aria-label="best"> ★</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            <tr>
              <th scope="row">Warnings</th>
              {columns.map((c, k) => (
                <td key={c.index} className="compare-warnings">
                  <WarningsStrip warnings={summaries[k].warnings} catalog={catalog} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        ★ marks the best value in each row.
        {isSample && ' Sample data: these numbers show the layout, not real physics.'}
      </p>
    </section>
  )
}
