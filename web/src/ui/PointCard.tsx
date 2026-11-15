import { useMemo, useState } from 'react'
import type { AppConfig } from '../api/config'
import { inPointArea, parsePointId, pointId } from '../api/points'
import { HOUSTON, presetsFrom, sameStation, stationLabel, stationQuery } from '../api/stations'
import type { Meta, Site, StationPoint } from '../api/types'
import { useMissionSeries, useSummary } from '../state/queries'
import type { TicketRank } from '../state/ranking'
import { useScenario } from '../state/scenario'
import { indexAt, liveStatus, type LiveStatus } from '../state/series'
import { cleanName, type Ticket } from '../state/tickets'
import { MISSION_RANGE } from '../state/urlState'
import { LUNAR_DAY_MS, formatIsoMinute, parseIsoMinute, snapToStep } from '../time'
import { HeightControl } from './HeightControl'
import { LivePanel } from './LivePanel'
import { MissionLength } from './MissionLength'
import { Pending } from './Pending'
import { formatLat, formatLon, parseCoord, pointLetter, siteDisplayName, siteTag, slopeWord, type Tone } from './points'
import { SampleTag } from './SampleTag'
import { ServerUnavailable } from './ServerUnavailable'
import { displayPresets } from './stationNetworks'
import { StationPicker } from './StationPicker'
import { TimeSlider } from './TimeSlider'
import { ticketVars } from './ticketStyle'
import { MissionMetrics, VerdictChips } from './VerdictChips'

export interface PointCardProps {
  index: number
  ticket: Ticket
  /** Catalog sites, for the site list and the "SITE 02" tag. */
  catalog: readonly Site[]
  site: Site | undefined
  stations: Meta['stations']
  rank: TicketRank | undefined
  rankedCount: number
  open: boolean
  isSample: boolean
  canDelete: boolean
  config: AppConfig
  search: string
  tau: number
  resultView: 'live' | 'mission'
  sliderMaxTau: number
  active: boolean
  onFocus: () => void
  onToggle: () => void
  onDelete: () => void
  onChange: (patch: Partial<Ticket>, mode: 'push' | 'replace') => void
  onTauInput: (tau: number) => void
  onTauCommit: (tau: number) => void
}

/** The card's fields while being edited; nothing changes until "Apply point X". */
interface Draft {
  name: string
  siteId: string | null
  lat: string
  lon: string
  date: string
  time: string
  days: number
  /** Solar panel and antenna heights, in meters (whole centimetres). */
  panel: number
  antenna: number
  stations: StationPoint[]
}

function draftOf(ticket: Ticket, site: Site | undefined): Draft {
  const at = site ? { lat: site.lat_deg, lon: site.lon_deg } : ticket.site ? parsePointId(ticket.site) : null
  return {
    name: ticket.name,
    siteId: ticket.site,
    lat: at ? formatLat(at.lat) : '',
    lon: at ? formatLon(at.lon) : '',
    date: ticket.t0.slice(0, 10),
    time: ticket.t0.slice(11, 16),
    days: ticket.days,
    panel: ticket.panel,
    antenna: ticket.antenna,
    stations: ticket.stationChoices ?? [ticket.station],
  }
}

type Resolved = { patch: Partial<Ticket>; error: string | null }

/** Turns the draft into a ticket patch, or says what is wrong with it. */
function resolve(d: Draft, currentStation: StationPoint): Resolved {
  const t0Ms = parseIsoMinute(`${d.date}T${d.time}Z`)
  const lat = parseCoord(d.lat, 'lat')
  const lon = parseCoord(d.lon, 'lon')
  let site = d.siteId
  let error: string | null = null
  if (site === null && (d.lat.trim() !== '' || d.lon.trim() !== '')) {
    if (lat === null || lon === null) error = 'Latitude like 88.75° S and longitude like 044.20° E.'
    else if (!inPointArea(lat, lon)) error = 'The site must be in the south-pole area, 84°S to 90°S.'
    else site = pointId(lat, lon)
  }
  const patch: Partial<Ticket> = {
    name: cleanName(d.name),
    site,
    days: d.days,
    panel: d.panel,
    antenna: d.antenna,
    station: d.stations.find((p) => sameStation(p, currentStation)) ?? d.stations[0] ?? currentStation,
    stationChoices: d.stations.length > 1 ? d.stations : undefined,
  }
  if (t0Ms === null) error ??= 'Choose a landing date and a time.'
  else {
    const t0 = formatIsoMinute(snapToStep(t0Ms))
    if (t0 < MISSION_RANGE.first || t0 > MISSION_RANGE.last) error ??= 'Landing dates run from 2026 to 2030.'
    else patch.t0 = t0
  }
  return { patch, error }
}

function Status({ label, word, tone }: { label: string; word: string; tone: Tone }) {
  return (
    <div className="status">
      <span className="status-label">
        <span className={`dot dot-${tone}`} aria-hidden="true" />
        {label}
      </span>
      <span className="status-word">{word}</span>
    </div>
  )
}

function statusOf(live: LiveStatus | null, site: Site | undefined) {
  const slope = site ? slopeWord(site.slope_deg) : null
  return {
    // null: the terrain behind the answer is unknown, so neither yes nor no.
    light: !live
      ? { word: '—', tone: 'none' as Tone }
      : live.sun.visible === null
        ? { word: 'Unknown', tone: 'none' as Tone }
        : live.sun.visible
        ? live.sun.litFraction !== null && live.sun.litFraction < 1
          ? { word: 'Partly lit', tone: 'mid' as Tone }
          : { word: 'Sunlit', tone: 'good' as Tone }
        : { word: 'Shaded', tone: 'bad' as Tone },
    earth: !live
      ? { word: '—', tone: 'none' as Tone }
      : live.earth.visible === null
        ? { word: 'Unknown', tone: 'none' as Tone }
        : live.earth.visible
        ? { word: 'Clear', tone: 'good' as Tone }
        : !live.earth.stationUp
          ? { word: 'No station', tone: 'mid' as Tone }
          : { word: 'Blocked', tone: 'bad' as Tone },
    slope: slope ?? { word: '—', tone: 'none' as Tone },
  }
}

const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`

/** One point in the Site calculator (UI design pages 3–13). */
export function PointCard(props: PointCardProps) {
  const { index, ticket, catalog, site, open, config, search, rank } = props
  const letter = pointLetter(index)
  const isDraftPoint = ticket.site === null
  const title = ticket.name || siteDisplayName(site) || (isDraftPoint ? 'New site' : 'Loading site…')

  const mission = { t0: ticket.t0, days: ticket.days, panel: ticket.panel, antenna: ticket.antenna, tau: props.tau }
  const scenario = useScenario(site?.id ?? null, mission, ticket.station)
  const series = useMissionSeries(config, search, scenario)
  const summary = useSummary(config, search, scenario)
  const t0Ms = parseIsoMinute(ticket.t0) as number
  const ownMaxTau = Math.floor((ticket.days * 1440) / 10) * 10
  const nowMs = t0Ms + Math.min(props.tau, ownMaxTau) * 60_000
  const live = useMemo(() => {
    if (!series.data) return null
    const i = indexAt(series.data, nowMs)
    return i === null ? null : liveStatus(series.data, i)
  }, [series.data, nowMs])
  const status = statusOf(live, site)

  // Edits stay in the card until applied, layered over what the ticket and site give. A new
  // ticket from outside (Back, another card's apply) discards them; the site arriving from the
  // catalog does not, so typing during load is not lost.
  const ticketKey = JSON.stringify([ticket.site, ticket.name, ticket.t0, ticket.days, ticket.panel, ticket.antenna, ticket.station, ticket.stationChoices])
  const editing = isDraftPoint || ticket.editing === true
  const presets = presetsFrom(props.stations)
  const stationPresets = displayPresets(presets)
  const [edits, setEdits] = useState<{ key: string; fields: Partial<Draft> }>({ key: ticketKey, fields: {} })
  const own = edits.key === ticketKey ? edits.fields : {}
  const draft: Draft = { ...draftOf(ticket, site), ...own }
  const setDraft = (patch: Partial<Draft>) => setEdits({ key: ticketKey, fields: { ...own, ...patch } })
  const { patch, error } = resolve(draft, ticket.station)
  const canApply = error === null && patch.site !== null && draft.stations.length > 0

  const addLunarDay = () => {
    const ms = parseIsoMinute(`${draft.date}T${draft.time}Z`)
    if (ms === null) return
    const next = formatIsoMinute(ms + LUNAR_DAY_MS)
    if (next <= MISSION_RANGE.last) setDraft({ date: next.slice(0, 10), time: next.slice(11, 16) })
  }

  const classes = ['point', open && 'point-open', rank?.best && 'point-best', !ticket.shown && 'point-hidden', isDraftPoint && 'point-draft']
    .filter(Boolean)
    .join(' ')

  return (
    <section className={classes} style={ticketVars(index)} data-active={props.active} aria-label={`Site ${letter}`}>
      <div className="point-head">
        <span className="badge" aria-hidden="true">
          {letter}
        </span>
        <h2 className="point-heading">
        <button type="button" className="point-title" onClick={props.onFocus} aria-pressed={props.active} title="Select this site in the explorer">
          <span className="point-name">{title}</span>
          <span className="point-tag mono">{siteTag(site, catalog)}</span>
        </button>
        </h2>
        {!editing && rank && (
          <span
            className={rank.best ? 'rank rank-best' : 'rank'}
            title={`Rank ${rank.rank} of ${props.rankedCount} (grade ${rank.grade.toFixed(1)} / 100) from the ranking function`}
            aria-label={`Rank ${rank.rank} of ${props.rankedCount}, grade ${rank.grade.toFixed(0)}`}
          >
            #{rank.rank}
            <span className="rank-grade num">{rank.grade.toFixed(0)}</span>
          </span>
        )}
        <span className="point-actions">
        {!editing && <button type="button" className="link-button edit-site" onClick={() => {
          props.onChange({ editing: true, collapsed: undefined }, 'push')
        }}>Edit input</button>}
        <label className="icon-plain show-toggle" title={ticket.shown ? 'Shown in the explorer' : 'Hidden from the explorer'}>
          <input
            type="checkbox"
            checked={ticket.shown}
            onChange={(e) => props.onChange({ shown: e.target.checked }, 'push')}
            aria-label={`Show site ${letter} in the explorer`}
          />
          <EyeIcon off={!ticket.shown} />
        </label>
        {props.canDelete && (
          <button type="button" className="icon-plain" onClick={props.onDelete} aria-label={`Delete site ${letter}`} title="Delete this site">
            <TrashIcon />
          </button>
        )}
        <button type="button" className="icon-plain chevron" onClick={props.onToggle} aria-label={open ? `Collapse site ${letter}` : `Open site ${letter}`}>
          {open ? '⌃' : '⌄'}
        </button>
        </span>
      </div>

      {!editing && (
        <div className="status-row">
          <Status label="LIGHT" {...status.light} />
          <Status label="EARTH DTE" {...status.earth} />
          <Status label="SLOPE" {...status.slope} />
        </div>
      )}

      {open && editing && (
        <form className="point-body" onSubmit={(e) => {
          e.preventDefault()
          if (canApply) {
            setEdits({ key: '', fields: {} })
            props.onChange({ ...patch, editing: undefined }, 'push')
          }
        }}>
          <div className="field-grid">
            <label className="field field-wide">
              <span className="field-label">SITE NAME</span>
              <input
                type="text"
                value={draft.name}
                placeholder={siteDisplayName(site) ?? `Site ${letter}`}
                maxLength={40}
                onChange={(e) => setDraft({ name: e.target.value })}
                aria-label="Site name"
              />
            </label>

            <label className="field field-wide">
              <span className="field-label">CATALOG SITE</span>
              <select
                value={draft.siteId !== null && !parsePointId(draft.siteId) ? draft.siteId : ''}
                onChange={(e) => {
                  const s = catalog.find((c) => c.id === e.target.value)
                  if (s) setDraft({ siteId: s.id, lat: formatLat(s.lat_deg), lon: formatLon(s.lon_deg) })
                  else setDraft({ siteId: null })
                }}
                aria-label="Site"
              >
                <option value="">Custom site (latitude, longitude)</option>
                {catalog.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">LATITUDE</span>
              <input
                type="text"
                inputMode="decimal"
                value={draft.lat}
                placeholder="Enter latitude"
                onChange={(e) => setDraft({ lat: e.target.value, siteId: null })}
                aria-label="Latitude"
              />
            </label>
            <label className="field">
              <span className="field-label">LONGITUDE</span>
              <input
                type="text"
                inputMode="decimal"
                value={draft.lon}
                placeholder="Enter longitude"
                onChange={(e) => setDraft({ lon: e.target.value, siteId: null })}
                aria-label="Longitude"
              />
            </label>

            <div className="field-row field-wide">
              <label className="field">
                <span className="field-label">LANDING DATE</span>
                <input
                  type="date"
                  value={draft.date}
                  min={MISSION_RANGE.first.slice(0, 10)}
                  max={MISSION_RANGE.last.slice(0, 10)}
                  onChange={(e) => setDraft({ date: e.target.value })}
                  aria-label="Landing date"
                />
              </label>
              <label className="field">
                <span className="field-label">TIME / UTC</span>
                <input type="time" step={600} value={draft.time} onChange={(e) => setDraft({ time: e.target.value })} aria-label="Landing time (UTC)" />
              </label>
              <button type="button" className="ghost lunar" onClick={addLunarDay} title="+1 lunar day: 29 d 12 h 40 min later, the same Sun angle" aria-label="+1 lunar day">
                ↻ +29.5 d
              </button>
            </div>

            <MissionLength key={draft.days} days={draft.days} onChange={(days) => setDraft({ days })} />

            <div className="field">
              <HeightControl key={`panel-${draft.panel}`} label="Panel" value={draft.panel} onChange={(panel) => setDraft({ panel })} />
            </div>
            <div className="field">
              <HeightControl key={`antenna-${draft.antenna}`} label="Antenna" value={draft.antenna} onChange={(antenna) => setDraft({ antenna })} />
            </div>

            <div className="field field-wide">
              <StationPicker
                value={draft.stations}
                presets={presets}
                onChange={(stations) => setDraft({ stations })}
              />
            </div>
          </div>

          {error && (draft.lat !== '' || draft.lon !== '' || !isDraftPoint) && <p className="field-error">{error}</p>}
          <button type="submit" className={canApply ? 'apply apply-ready' : 'apply'} disabled={!canApply}>
            Apply site {letter}
          </button>
        </form>
      )}

      {open && !editing && (
        <div className="point-body site-output">
          {ticket.stationChoices && ticket.stationChoices.length > 1 ? (
            <label className="result-station field">
              <span className="field-label">Results for station</span>
              <select value={stationQuery(ticket.station)} onChange={(e) => {
                const station = ticket.stationChoices?.find((p) => stationQuery(p) === e.target.value)
                if (station) props.onChange({ station }, 'push')
              }}>
                {ticket.stationChoices.map((p) => <option key={stationQuery(p)} value={stationQuery(p)}>{stationLabel(p, stationPresets)}</option>)}
              </select>
            </label>
          ) : (
            <p className="result-station" title={stationLabel(ticket.station, stationPresets)}>
              <span className="field-label">Earth station</span>
              {sameStation(ticket.station, HOUSTON) ? 'Houston (demonstration location)' : stationLabel(ticket.station, stationPresets)}
            </p>
          )}
              {props.resultView === 'live' && <dl className="stats">
                <div>
                  <dt>SUN ELEV.</dt>
                  <dd className="num">{live ? signed(live.sun.el) : '—'}</dd>
                </div>
                <div>
                  <dt>EARTH ELEV.</dt>
                  <dd className="num">{live ? signed(live.earth.el) : '—'}</dd>
                </div>
                <div>
                  <dt>LOCAL SLOPE</dt>
                  <dd className="num">{site ? `${site.slope_deg.toFixed(1)}°` : '—'}</dd>
                </div>
                <div title="Dust data is not available yet">
                  <dt>DUST</dt>
                  <dd className="num muted">n/a</dd>
                </div>
              </dl>}

              {props.resultView === 'live' ? <div className="mission-time">
                <span className="field-label">MISSION TIME</span>
                <TimeSlider
                  tau={Math.min(props.tau, props.sliderMaxTau)}
                  maxTau={props.sliderMaxTau}
                  landingMs={t0Ms}
                  onInput={props.onTauInput}
                  onCommit={props.onTauCommit}
                />
                {series.isError ? (
                  <ServerUnavailable onRetry={series.refetch} />
                ) : live ? (
                  <LivePanel status={live} />
                ) : (
                  <Pending label="Loading Sun and Earth positions…" />
                )}
              </div> : <div className="whole-mission">
                <span className="field-label">WHOLE MISSION {props.isSample && <SampleTag />}</span>
                {summary.isError ? (
                  <ServerUnavailable onRetry={() => void summary.refetch()} />
                ) : summary.data && site ? (
                  <>
                    <VerdictChips summary={summary.data} slopeDeg={site.slope_deg} />
                    <MissionMetrics summary={summary.data} />
                  </>
                ) : (
                  <Pending label="Computing verdict…" />
                )}
              </div>}
        </div>
      )}
    </section>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
      {off && <path d="M2.5 13.5 13.5 2.5" />}
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.6 6.5v4.5M9.4 6.5v4.5" />
    </svg>
  )
}
