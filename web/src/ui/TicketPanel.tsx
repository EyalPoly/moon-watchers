import { useRef, useState } from 'react'
import type { AppConfig } from '../api/config'
import type { Region, Site } from '../api/types'
import { AreaTool } from '../map/AreaTool'
import { CenterOn } from '../map/CenterOn'
import { PolarMap } from '../map/PolarMap'
import { parallelRadiusM } from '../map/projection'
import { SitePins } from '../map/SitePins'
import { SkyView } from '../sky/SkyView'
import { useHorizon, useMissionSeries } from '../state/queries'
import { useScenario } from '../state/scenario'
import type { PanelView, Ticket } from '../state/tickets'
import { DAY_MS, parseIsoMinute } from '../time'
import { Pending } from './MissionCard'
import { ResizeHandle } from './ResizeHandle'
import { ServerUnavailable } from './ServerUnavailable'
import { panelId, ticketLabel, ticketVars } from './ticketStyle'

export interface TicketPanelProps {
  index: number
  ticket: Ticket
  site: Site | undefined
  sites: readonly Site[]
  region: Region
  config: AppConfig
  search: string
  tau: number
  stationLabel: string
  best: boolean
  /** Several panels share a scrolling column: map zoom then needs Ctrl + scroll. */
  stacked: boolean
  expanded: boolean
  canExpand: boolean
  onSelectSite: (id: string) => void
  onView: (view: PanelView) => void
  onFocus: () => void
  onExpand: () => void
  /** Height the user dragged the panel to; undefined is the automatic size. */
  height: number | undefined
  onResize: (height: number | undefined) => void
  /** Opens a ticket for each area picked with the area tool. */
  onOpenAreas: (points: { site: string; name: string }[]) => void
}

export const PANEL_MIN_H = 200
export const PANEL_MAX_H = 1400

const VIEWS: { id: PanelView; label: string; title: string }[] = [
  { id: 'map', label: 'Map', title: 'Map view: the south pole from above, with the catalog sites' },
  { id: 'graph', label: 'Sky graph', title: "Sky view: the skyline from the lander, with the Sun's and Earth's paths" },
]

/** One ticket's part of the main area: its map or its sky graph (sketch: stacked panels). */
export function TicketPanel(props: TicketPanelProps) {
  const { index, ticket, site, sites, region } = props
  const [areaTool, setAreaTool] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const label = ticketLabel(index, ticket.name)
  const sized = props.height !== undefined
  return (
    <section
      ref={sectionRef}
      id={panelId(index)}
      className={['panel', props.best && 'panel-best', sized && 'panel-sized'].filter(Boolean).join(' ')}
      style={{ ...ticketVars(index), ...(sized ? { height: props.height } : {}) }}
      aria-label={`${label} view`}
    >
      <div className="panel-head">
        <button type="button" className="panel-title" onClick={props.onFocus} title="Open this ticket">
          <span className="ticket-dot" aria-hidden="true" />
          {label}
          {site && <span className="ticket-site">{site.name}</span>}
        </button>
        <div className="view-tabs" role="tablist" aria-label={`${label} view`}>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={ticket.view === v.id}
              className={ticket.view === v.id ? 'view-tab view-tab-active' : 'view-tab'}
              title={v.title}
              onClick={() => props.onView(v.id)}
            >
              {v.label}
            </button>
          ))}
          <button
            type="button"
            className={areaTool && ticket.view === 'map' ? 'view-tab view-tab-active' : 'view-tab'}
            aria-pressed={areaTool && ticket.view === 'map'}
            title="Select an area: draw an outline on the map grid and get its best spots"
            onClick={() => {
              if (ticket.view !== 'map') props.onView('map')
              setAreaTool((on) => ticket.view !== 'map' || !on)
            }}
          >
            Select area
          </button>
          {props.canExpand && (
            <button
              type="button"
              className="view-tab"
              onClick={props.onExpand}
              aria-pressed={props.expanded}
              title={props.expanded ? 'Show all tickets again' : 'Show only this ticket, full size'}
            >
              {props.expanded ? 'Show all' : 'Expand'}
            </button>
          )}
        </div>
      </div>
      <div className="panel-body">
        {ticket.view === 'map' ? (
          <PolarMap region={region} wheelNeedsModifier={props.stacked}>
            <SitePins sites={sites} selectedId={ticket.site} onSelect={props.onSelectSite} />
            <CenterOn site={site} />
            {areaTool && (
              <AreaTool
                areaRadiusM={parallelRadiusM(region, region.custom_area.max_lat_deg)}
                namePrefix={label}
                onClose={() => setAreaTool(false)}
                onOpen={(points) => {
                  setAreaTool(false)
                  props.onOpenAreas(points)
                }}
              />
            )}
          </PolarMap>
        ) : site ? (
          <TicketGraph
            config={props.config}
            search={props.search}
            site={site}
            ticket={ticket}
            tau={props.tau}
            stationLabel={props.stationLabel}
          />
        ) : (
          <p className="panel-empty">Choose a site for this ticket to see its sky.</p>
        )}
      </div>
      <ResizeHandle
        orientation="horizontal"
        label={`Resize ${label}`}
        value={props.height ?? PANEL_MIN_H}
        min={PANEL_MIN_H}
        max={PANEL_MAX_H}
        onResize={(h) => props.onResize(h)}
        onReset={() => props.onResize(undefined)}
        measure={() => sectionRef.current?.offsetHeight}
        className="panel-resize"
      />
    </section>
  )
}

function TicketGraph({
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

  if (horizon.isError) return <ServerUnavailable onRetry={() => void horizon.refetch()} />
  if (!horizon.data) return <Pending label="Loading horizon…" />
  return (
    <div className="panel-graph">
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
