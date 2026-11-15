import { useMemo } from 'react'
import type { AppConfig } from '../api/config'
import type { Site } from '../api/types'
import { SkyView } from '../sky/SkyView'
import { useHorizon, useMissionSeries } from '../state/queries'
import { useScenario } from '../state/scenario'
import { indexAt } from '../state/series'
import type { Ticket } from '../state/tickets'
import { DAY_MS, parseIsoMinute } from '../time'
import { Pending } from './Pending'
import { ServerUnavailable } from './ServerUnavailable'

const COMPASS_WORDS = ['NORTH', 'NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST']

export function TicketGraph({
  config,
  search,
  site,
  ticket,
  tau,
  stationLabel,
}: {
  config: AppConfig
  search: string
  site: Site
  ticket: Ticket
  tau: number
  stationLabel: string
}) {
  const mission = { t0: ticket.t0, days: ticket.days, panel: ticket.panel, antenna: ticket.antenna, tau }
  const scenario = useScenario(site.id, mission, ticket.station)
  const horizon = useHorizon(config, search, site.id, ticket.panel)
  // Same query key as the panel's when the heights match, so it costs no extra request.
  const antennaHorizon = useHorizon(config, search, site.id, ticket.antenna)
  const series = useMissionSeries(config, search, scenario)
  const t0Ms = parseIsoMinute(ticket.t0) as number
  const endMs = t0Ms + ticket.days * DAY_MS
  const nowMs = t0Ms + Math.min(tau, Math.floor((ticket.days * 1440) / 10) * 10) * 60_000
  const sun = useMemo(() => {
    if (!series.data) return null
    const i = indexAt(series.data, nowMs)
    return i === null ? null : { az: series.data.sun_az[i], el: series.data.sun_el[i] }
  }, [series.data, nowMs])

  if (horizon.isError) return <ServerUnavailable onRetry={() => void horizon.refetch()} />
  if (!horizon.data) return <Pending label="Loading horizon…" />
  return (
    <div className="panel-graph">
      <div className="graph-head">
        <div>
          <h3 className="graph-title">Local horizon</h3>
          <p className="graph-sub">Highest ridge at each compass bearing</p>
        </div>
      </div>
      {sun && (
        <div className="facing">
          <span className="facing-label">FACING THE SUN</span>
          <span className="mono">
            {COMPASS_WORDS[Math.round(sun.az / 45) % 8]} / {String(Math.round(sun.az)).padStart(3, '0')}°
          </span>
          <span className="facing-sun">
            Sun elevation {tau === 0 ? 'at landing' : 'now'}: {sun.el >= 0 ? '+' : ''}
            {sun.el.toFixed(1)}°
          </span>
        </div>
      )}
      <SkyView
        horizon={horizon.data}
        antennaHorizon={antennaHorizon.data}
        series={series.data}
        startMs={t0Ms}
        endMs={endMs}
        nowMs={nowMs}
        stationLabel={stationLabel}
      />
    </div>
  )
}
