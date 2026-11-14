import type { AppConfig } from '../api/config'
import type { ScoreSettings } from '../api/scoreSettings'
import { presetsFrom, stationQuery } from '../api/stations'
import type { Meta, Site } from '../api/types'
import type { TicketRank } from '../state/ranking'
import type { Ticket } from '../state/tickets'
import type { MissionState } from '../state/urlState'
import { MissionBody, MissionVerdict } from './MissionCard'
import { PointPicker } from './PointPicker'
import { SampleTag } from './SampleTag'
import { StationPicker } from './StationPicker'
import { TicketName } from './TicketName'
import { ticketLabel, ticketVars } from './ticketStyle'

export interface TicketCardProps {
  index: number
  ticket: Ticket
  sites: readonly Site[]
  /** The ticket's site, once the catalog has it. */
  site: Site | undefined
  stations: Meta['stations']
  rank: TicketRank | undefined
  rankedCount: number
  open: boolean
  isSample: boolean
  canDelete: boolean
  config: AppConfig
  search: string
  settings: ScoreSettings
  tau: number
  sliderMaxTau: number
  onToggle: () => void
  onDelete: () => void
  onChange: (patch: Partial<Ticket>, mode: 'push' | 'replace') => void
  onTauInput: (tau: number) => void
  onTauCommit: (tau: number) => void
}

export function TicketCard(props: TicketCardProps) {
  const { index, ticket, sites, site, open, isSample, canDelete, config, search, rank } = props
  const label = ticketLabel(index, ticket.name)
  const mission: MissionState = {
    t0: ticket.t0,
    days: ticket.days,
    panel: ticket.panel,
    antenna: ticket.antenna,
    tau: props.tau,
  }
  const station = ticket.station
  const onMissionChange = (next: Partial<MissionState>, mode: 'push' | 'replace') => {
    const patch: Partial<Ticket> = {}
    if (next.t0 !== undefined) patch.t0 = next.t0
    if (next.days !== undefined) patch.days = next.days
    if (next.panel !== undefined) patch.panel = next.panel
    if (next.antenna !== undefined) patch.antenna = next.antenna
    props.onChange(patch, mode)
  }
  const classes = ['ticket', open && 'ticket-open', rank?.best && 'ticket-best', !ticket.shown && 'ticket-hidden']
    .filter(Boolean)
    .join(' ')

  return (
    <section className={classes} style={ticketVars(index)} aria-label={site ? `${label}: ${site.name}` : label}>
      <div className="ticket-head">
        <button
          type="button"
          className="ticket-toggle"
          onClick={props.onToggle}
          aria-expanded={open}
          title={open ? 'Collapse' : 'Open this ticket'}
        >
          <span className="ticket-dot" aria-hidden="true" />
          <span className="ticket-label">{label}</span>
          {site && <span className="ticket-site">{site.name}</span>}
          <span className="ticket-chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
        </button>
        {rank && (
          <span
            className={rank.best ? 'rank rank-best' : 'rank'}
            title={`Rank ${rank.rank} of ${props.rankedCount} (grade ${rank.grade.toFixed(1)} / 100) from the ranking function`}
            aria-label={`Rank ${rank.rank} of ${props.rankedCount}, grade ${rank.grade.toFixed(0)}`}
          >
            #{rank.rank}
            <span className="rank-grade num">{rank.grade.toFixed(0)}</span>
          </span>
        )}
        <label className="show-toggle" title={ticket.shown ? 'Shown in the main area' : 'Hidden from the main area'}>
          <input
            type="checkbox"
            checked={ticket.shown}
            onChange={(e) => props.onChange({ shown: e.target.checked }, 'push')}
            aria-label={`Show ${label} in the main area`}
          />
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z" />
            <circle cx="8" cy="8" r="2" />
            {!ticket.shown && <path d="M2.5 13.5 13.5 2.5" />}
          </svg>
        </label>
        {canDelete && (
          <button type="button" className="icon-plain" onClick={props.onDelete} aria-label={`Delete ${label}`} title="Delete this ticket">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.6 6.5v4.5M9.4 6.5v4.5" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <>
          <TicketName key={ticket.name} name={ticket.name} placeholder={`Ticket ${index + 1}`} onChange={(name) => props.onChange({ name }, 'push')} />
          <div className="ticket-point">
            <PointPicker
              key={ticket.site ?? ''}
              value={ticket.site}
              sites={sites}
              onChange={(id) => props.onChange({ site: id }, 'push')}
            />
            {site && isSample && <SampleTag />}
          </div>
        </>
      )}

      {!site && open && <p className="hint">Pick a site on this ticket's map or in the list to see its sky, verdict and countdowns.</p>}

      {site && open && (
        <>
          <h2>{site.name}</h2>
          <dl className="facts">
            <div>
              <dt>Category</dt>
              <dd>{site.category}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd className="num">
                {Math.abs(site.lat_deg).toFixed(2)}°S, {Math.abs(site.lon_deg).toFixed(2)}°{site.lon_deg < 0 ? 'W' : 'E'}
              </dd>
            </div>
            <div>
              <dt>Slope</dt>
              <dd className="num">
                {site.slope_deg.toFixed(1)}° over {site.slope_baseline_m} m
              </dd>
            </div>
          </dl>
        </>
      )}

      {site && <MissionVerdict config={config} search={search} site={site} mission={mission} station={station} settings={props.settings} />}

      {open && (
        <StationPicker
          key={stationQuery(station)}
          value={station}
          presets={presetsFrom(props.stations)}
          onChange={(next) => props.onChange({ station: next }, 'push')}
        />
      )}

      {site && open && (
        <MissionBody
          config={config}
          search={search}
          site={site}
          mission={mission}
          station={station}
          settings={props.settings}
          tau={props.tau}
          sliderMaxTau={props.sliderMaxTau}
          onMissionChange={onMissionChange}
          onTauInput={props.onTauInput}
          onTauCommit={props.onTauCommit}
        />
      )}
    </section>
  )
}
