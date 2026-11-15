import type { ReactNode } from 'react'
import type { AppConfig } from '../api/config'
import type { Site } from '../api/types'
import { SkyView } from '../sky/SkyView'
import { useHorizon, useMissionSeries } from '../state/queries'
import { useScenario } from '../state/scenario'
import { indexAt } from '../state/series'
import type { Ticket } from '../state/tickets'
import { DAY_MS, monthKey, parseIsoMinute } from '../time'
import { Pending } from './Pending'
import { ServerUnavailable } from './ServerUnavailable'

const COMPASS_WORDS = ['NORTH', 'NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST']

export function TicketGraph({
  config,
  search,
  site,
  ticket,
  nowMs,
  controls,
  stationLabel,
}: {
  config: AppConfig
  search: string
  site: Site
  ticket: Ticket
  nowMs: number
  controls: ReactNode
  stationLabel: string
}) {
  const scenario = useScenario(site.id, ticket, ticket.station)
  const horizon = useHorizon(config, search, site.id, ticket.panel)
  // Same query key as the panel's when the heights match, so it costs no extra request.
  const antennaHorizon = useHorizon(config, search, site.id, ticket.antenna)
  const series = useMissionSeries(config, search, scenario)
  const t0Ms = parseIsoMinute(ticket.t0) as number
  const endMs = t0Ms + ticket.days * DAY_MS
  const outsideMission = nowMs < t0Ms || nowMs > endMs
  const observation = useMissionSeries(config, search, outsideMission ? scenario : null, monthKey(nowMs))
  const current = outsideMission ? observation : series
  const i = current.data && indexAt(current.data, nowMs)
  const sun = current.data && i !== null ? { az: current.data.sun_az[i], el: current.data.sun_el[i] } : null

  if (!horizon.data) return <>
    {horizon.isError ? <ServerUnavailable onRetry={() => void horizon.refetch()} /> : <Pending label="Loading horizon…" />}
    <div className="graph-footer">{controls}</div>
  </>
  return (
    <div className="panel-graph">
      <div className="graph-head">
        <div>
          <h3 className="graph-title">Local Horizon</h3>
          <p className="graph-sub">Highest ridge at each compass bearing</p>
        </div>
      </div>
      {sun && (
        <div className="facing">
          <span className="facing-label">Sun Bearing</span>
          <span className="mono">
            {COMPASS_WORDS[Math.round(sun.az / 45) % 8]} / {String(Math.round(sun.az)).padStart(3, '0')}°
          </span>
          <span className="facing-sun">
            Sun elevation {nowMs === t0Ms ? 'at landing' : 'now'}: {sun.el >= 0 ? '+' : ''}
            {sun.el.toFixed(1)}°
          </span>
        </div>
      )}
      {current.isError && <ServerUnavailable onRetry={current.refetch} />}
      <SkyView
        horizon={horizon.data}
        antennaHorizon={antennaHorizon.data}
        series={series.data}
        observationSeries={current.data}
        controls={controls}
        startMs={t0Ms}
        endMs={endMs}
        nowMs={nowMs}
        stationLabel={stationLabel}
      />
    </div>
  )
}
