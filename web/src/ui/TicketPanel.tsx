import { useMemo, useRef } from 'react'
import type { AppConfig } from '../api/config'
import type { Region, Site } from '../api/types'
import { AreaTool } from '../map/AreaTool'
import { CenterOn } from '../map/CenterOn'
import { PlacePoint } from '../map/PlacePoint'
import { PolarMap } from '../map/PolarMap'
import { parallelRadiusM } from '../map/projection'
import { SitePins } from '../map/SitePins'
import { SkyView } from '../sky/SkyView'
import { useHorizon, useMissionSeries } from '../state/queries'
import { useScenario } from '../state/scenario'
import { indexAt } from '../state/series'
import type { PanelView, Ticket } from '../state/tickets'
import { DAY_MS, parseIsoMinute } from '../time'
import { Pending } from './Pending'
import { pointLetter, siteTag } from './points'
import { ResizeHandle } from './ResizeHandle'
import { ServerUnavailable } from './ServerUnavailable'
import { panelId, ticketVars } from './ticketStyle'

export interface TicketPanelProps {
  index: number
  ticket: Ticket
  site: Site | undefined
  /** All sites with pins: the catalog and the users' custom points. */
  sites: readonly Site[]
  catalog: readonly Site[]
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
  /** Freehand Select is on for this point (turned on from its card). */
  freehand: boolean
  onFreehandClose: () => void
  onSelectSite: (id: string) => void
  onView: (view: PanelView) => void
  onFocus: () => void
  onExpand: () => void
  /** Height the user dragged the panel to; undefined is the automatic size. */
  height: number | undefined
  onResize: (height: number | undefined) => void
  /** Opens a point for each area picked with Freehand Select. */
  onOpenAreas: (points: { site: string; name: string }[]) => void
}

export const PANEL_MIN_H = 220
export const PANEL_MAX_H = 1400

// Map layers from the UI design. Only Relief has data today; the rest need the engine's
// shadow and visibility grids (slice S8) or the simulated dust map.
const LAYERS = [
  { id: 'relief', label: 'Relief', ready: true },
  { id: 'illumination', label: 'Illumination', ready: false },
  { id: 'earth', label: 'Earth DTE', ready: false },
  { id: 'slope', label: 'Slope', ready: false },
  { id: 'dust', label: 'Dust', ready: false },
]

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

/** One point's part of the South pole explorer: its map or its ridge graph. */
export function TicketPanel(props: TicketPanelProps) {
  const { index, ticket, site, sites, region } = props
  const sectionRef = useRef<HTMLElement>(null)
  const letter = pointLetter(index)
  const title = ticket.name || site?.name || 'New point'
  const sized = props.height !== undefined
  const placing = ticket.site === null && ticket.view === 'map' && !props.freehand
  const when = ticket.t0.slice(0, 10)
  const whenLabel = `${new Date(`${when}T00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()}  /  ${ticket.t0.slice(11, 16)} UTC`

  return (
    <section
      ref={sectionRef}
      id={panelId(index)}
      className={['panel', props.best && 'panel-best', sized && 'panel-sized'].filter(Boolean).join(' ')}
      style={{ ...ticketVars(index), ...(sized ? { height: props.height } : {}) }}
      aria-label={`Point ${letter} view`}
    >
      <div className="panel-head">
        <button type="button" className="panel-title" onClick={props.onFocus} title="Open this point in the calculator">
          <span className="badge" aria-hidden="true">
            {letter}
          </span>
          <span className="point-name">{title}</span>
          <span className="point-tag mono">{siteTag(site, props.catalog)}</span>
        </button>
        {props.freehand ? (
          <span className="mode-tag mono">FREEHAND SELECT</span>
        ) : ticket.site === null ? (
          <span className="mode-tag mono">POINT LOCATION</span>
        ) : null}
        <div className="view-tabs" role="tablist" aria-label={`Point ${letter} view`}>
          <button
            type="button"
            role="tab"
            aria-selected={ticket.view === 'map'}
            className={ticket.view === 'map' ? 'view-tab view-tab-active' : 'view-tab'}
            title="Map view · Explore the terrain from above"
            onClick={() => props.onView('map')}
          >
            <MapIcon /> Map view
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ticket.view === 'graph'}
            className={ticket.view === 'graph' ? 'view-tab view-tab-active' : 'view-tab'}
            title="Ridge graph · See what blocks the Sun"
            onClick={() => props.onView('graph')}
          >
            <GraphIcon /> Ridge graph
          </button>
          {props.canExpand && (
            <button
              type="button"
              className="view-tab icon-tab"
              onClick={props.onExpand}
              aria-pressed={props.expanded}
              aria-label={props.expanded ? 'Show all points' : 'Expand'}
              title={props.expanded ? 'Show all points again' : 'Show only this point, full size'}
            >
              {props.expanded ? '⤡' : '⤢'}
            </button>
          )}
        </div>
      </div>

      {ticket.view === 'map' && (
        <>
          {props.freehand ? (
            <p className="panel-hint">Outline an area on the grid, then pick the best spots to open as points.</p>
          ) : placing ? (
            <p className="panel-hint">Click the map to place a point, or use Freehand Select to outline an area.</p>
          ) : (
            <div className="layer-tabs" role="tablist" aria-label="Map layer">
              {LAYERS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={l.id === 'relief'}
                  className={l.id === 'relief' ? 'layer-tab layer-tab-active' : 'layer-tab'}
                  disabled={!l.ready}
                  title={l.ready ? 'NASA Moon Trek hillshade' : `${l.label}: coming with the engine's map grids`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="panel-body">
        {ticket.view === 'map' ? (
          <PolarMap region={region} wheelNeedsModifier={props.stacked}>
            <SitePins sites={sites} selectedId={ticket.site} selectedLabel={letter} onSelect={props.onSelectSite} />
            <CenterOn site={site} />
            {placing && <PlacePoint areaRadiusM={parallelRadiusM(region, region.custom_area.max_lat_deg)} onPlace={props.onSelectSite} />}
            {props.freehand && (
              <AreaTool
                areaRadiusM={parallelRadiusM(region, region.custom_area.max_lat_deg)}
                namePrefix={title}
                onClose={props.onFreehandClose}
                onOpen={(points) => {
                  props.onFreehandClose()
                  props.onOpenAreas(points)
                }}
              />
            )}
          </PolarMap>
        ) : site ? (
          <TicketGraph config={props.config} search={props.search} site={site} ticket={ticket} tau={props.tau} stationLabel={props.stationLabel} />
        ) : (
          <p className="panel-empty">Place this point on the map, or type its latitude and longitude, to see its local horizon.</p>
        )}
      </div>

      {ticket.view === 'map' && (
        <div className="panel-foot">
          <span>LOLA south polar terrain</span>
          <span className="mono">{site ? whenLabel : 'LRO / 240 m DEM'}</span>
        </div>
      )}

      <ResizeHandle
        orientation="horizontal"
        label={`Resize point ${letter}`}
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

const COMPASS_WORDS = ['NORTH', 'NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST']

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
  const mission = { t0: ticket.t0, days: ticket.days, mast: ticket.mast, tau }
  const scenario = useScenario(site.id, mission, { station: ticket.station, lat: ticket.lat, lon: ticket.lon })
  const horizon = useHorizon(config, search, site.id, ticket.mast)
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
      <SkyView horizon={horizon.data} series={series.data} startMs={t0Ms} endMs={endMs} nowMs={nowMs} stationLabel={stationLabel} />
    </div>
  )
}
