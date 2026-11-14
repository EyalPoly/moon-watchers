import { useMemo, useState } from 'react'
import type { AppConfig } from '../api/config'
import { inPointArea, parsePointId, pointId } from '../api/points'
import type { Meta, Site } from '../api/types'
import { useMissionSeries, useSummary } from '../state/queries'
import type { TicketRank } from '../state/ranking'
import { useScenario } from '../state/scenario'
import { indexAt, liveStatus, type LiveStatus } from '../state/series'
import { cleanName, type EarthStationChoice, type Ticket } from '../state/tickets'
import { MISSION_RANGE } from '../state/urlState'
import { LUNAR_DAY_MS, formatDuration, formatIsoMinute, parseIsoMinute, snapToStep } from '../time'
import { MissionLength } from './MissionLength'
import { Pending } from './Pending'
import { formatLat, formatLon, parseCoord, pointLetter, siteTag, slopeWord, type Tone } from './points'
import { SampleTag } from './SampleTag'
import { ServerUnavailable } from './ServerUnavailable'
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
  sliderMaxTau: number
  freehand: boolean
  onToggle: () => void
  onDelete: () => void
  onChange: (patch: Partial<Ticket>, mode: 'push' | 'replace') => void
  onFreehand: () => void
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
  mast: string
  earth: EarthStationChoice
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
    mast: String(ticket.mast),
    earth: { station: ticket.station, lat: ticket.lat, lon: ticket.lon },
  }
}

type Resolved = { patch: Partial<Ticket>; error: string | null }

/** Turns the draft into a ticket patch, or says what is wrong with it. */
function resolve(d: Draft): Resolved {
  const t0Ms = parseIsoMinute(`${d.date}T${d.time}Z`)
  const mast = Number(d.mast)
  const lat = parseCoord(d.lat, 'lat')
  const lon = parseCoord(d.lon, 'lon')
  let site = d.siteId
  let error: string | null = null
  if (site === null && (d.lat.trim() !== '' || d.lon.trim() !== '')) {
    if (lat === null || lon === null) error = 'Latitude like 88.75° S and longitude like 044.20° E.'
    else if (!inPointArea(lat, lon)) error = 'The point must be in the south-pole area, 84°S to 90°S.'
    else site = pointId(lat, lon)
  }
  const patch: Partial<Ticket> = {
    name: cleanName(d.name),
    site,
    days: d.days,
    station: d.earth.station,
    lat: d.earth.lat,
    lon: d.earth.lon,
  }
  if (t0Ms === null) error ??= 'Choose a landing date and a time.'
  else {
    const t0 = formatIsoMinute(snapToStep(t0Ms))
    if (t0 < MISSION_RANGE.first || t0 > MISSION_RANGE.last) error ??= 'Landing dates run from 2026 to 2030.'
    else patch.t0 = t0
  }
  if (!(mast >= 1 && mast <= 10)) error ??= 'Mast height is 1 to 10 m.'
  else patch.mast = Math.round(mast * 2) / 2
  return { patch, error }
}

function changed(ticket: Ticket, patch: Partial<Ticket>): boolean {
  return (Object.keys(patch) as (keyof Ticket)[]).some((k) => patch[k] !== ticket[k])
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
    light: !live
      ? { word: '—', tone: 'none' as Tone }
      : live.sun.visible
        ? live.sun.litFraction < 1
          ? { word: 'Partly lit', tone: 'mid' as Tone }
          : { word: 'Sunlit', tone: 'good' as Tone }
        : { word: 'Shaded', tone: 'bad' as Tone },
    earth: !live
      ? { word: '—', tone: 'none' as Tone }
      : live.earth.visible
        ? { word: 'Clear', tone: 'good' as Tone }
        : !live.earth.stationUp
          ? { word: 'No station', tone: 'mid' as Tone }
          : { word: 'Blocked', tone: 'bad' as Tone },
    slope: slope ?? { word: '—', tone: 'none' as Tone },
  }
}

const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`

function countdowns(live: LiveStatus): string {
  const part = (visible: boolean, change: LiveStatus['sun']['change'], setWord: string, riseWord: string) => {
    const word = visible ? setWord : riseWord
    return change.kind === 'at' ? `${word} in ${formatDuration(change.inMs)}` : `${word} not before the data ends`
  }
  return `${part(live.sun.visible, live.sun.change, 'Sunset', 'Sunrise')} · ${part(live.earth.visible, live.earth.change, 'Earthset', 'Earthrise')}`
}

/** One point in the Site calculator (UI design pages 3–13). */
export function PointCard(props: PointCardProps) {
  const { index, ticket, catalog, site, open, config, search, rank } = props
  const letter = pointLetter(index)
  const isDraftPoint = ticket.site === null
  const title = ticket.name || site?.name || (isDraftPoint ? 'New point' : 'Loading point…')

  const mission = { t0: ticket.t0, days: ticket.days, mast: ticket.mast, tau: props.tau }
  const earth = { station: ticket.station, lat: ticket.lat, lon: ticket.lon }
  const scenario = useScenario(site?.id ?? null, mission, earth)
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

  // Edits stay in the card until applied. A new ticket from outside (Back, another card's
  // apply) resets them: the key below changes with the ticket.
  const ticketKey = JSON.stringify(ticket) + (site?.id ?? '')
  const [draftState, setDraftState] = useState({ key: ticketKey, draft: draftOf(ticket, site) })
  const draft = draftState.key === ticketKey ? draftState.draft : draftOf(ticket, site)
  const setDraft = (patch: Partial<Draft>) => setDraftState({ key: ticketKey, draft: { ...draft, ...patch } })
  const { patch, error } = resolve(draft)
  const pending = changed(ticket, patch)
  const canApply = pending && error === null && patch.site !== null

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
    <section className={classes} style={ticketVars(index)} aria-label={site ? `Point ${letter}: ${title}` : `Point ${letter}`}>
      <div className="point-head">
        <span className="badge" aria-hidden="true">
          {letter}
        </span>
        <h2 className="point-heading">
        <button type="button" className="point-title" onClick={props.onToggle} aria-expanded={open} title={open ? 'Collapse' : 'Open this point'}>
          <span className="point-name">{title}</span>
          <span className="point-tag mono">{siteTag(site, catalog)}</span>
        </button>
        </h2>
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
        <span className="point-actions">
        <button
          type="button"
          className={props.freehand ? 'freehand freehand-on' : 'freehand'}
          aria-pressed={props.freehand}
          onClick={props.onFreehand}
          title="Outline an area on this point's map and get its best landing spots"
        >
          <LassoIcon /> Freehand Select
        </button>
        <label className="icon-plain show-toggle" title={ticket.shown ? 'Shown in the explorer' : 'Hidden from the explorer'}>
          <input
            type="checkbox"
            checked={ticket.shown}
            onChange={(e) => props.onChange({ shown: e.target.checked }, 'push')}
            aria-label={`Show point ${letter} in the explorer`}
          />
          <EyeIcon off={!ticket.shown} />
        </label>
        {props.canDelete && (
          <button type="button" className="icon-plain" onClick={props.onDelete} aria-label={`Delete point ${letter}`} title="Delete this point">
            <TrashIcon />
          </button>
        )}
        <button type="button" className="icon-plain chevron" onClick={props.onToggle} aria-label={open ? `Collapse point ${letter}` : `Open point ${letter}`}>
          {open ? '⌃' : '⌄'}
        </button>
        </span>
      </div>

      {isDraftPoint ? (
        <p className="awaiting">
          <TargetIcon /> Awaiting a landing point
        </p>
      ) : (
        <div className="status-row">
          <Status label="LIGHT" {...status.light} />
          <Status label="EARTH DTE" {...status.earth} />
          <Status label="SLOPE" {...status.slope} />
        </div>
      )}

      {open && (
        <form
          className="point-body"
          onSubmit={(e) => {
            e.preventDefault()
            if (canApply) props.onChange(patch, 'push')
          }}
        >
          <div className="field-grid">
            <label className="field field-wide">
              <span className="field-label">POINT NAME</span>
              <input
                type="text"
                value={draft.name}
                placeholder={site?.name ?? `Point ${letter}`}
                maxLength={40}
                onChange={(e) => setDraft({ name: e.target.value })}
                aria-label="Point name"
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
                <option value="">Custom point (latitude, longitude)</option>
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
                <span className="field-label">POINT LANDING DATE</span>
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

            <label className="field">
              <span className="field-label">MAST HEIGHT</span>
              <span className="unit-input">
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  value={draft.mast}
                  onChange={(e) => setDraft({ mast: e.target.value })}
                  aria-label="Mast height in meters"
                />
                <span>m</span>
              </span>
            </label>

            <div className="field field-wide">
              <StationPicker
                key={`${draft.earth.station}${draft.earth.lat}${draft.earth.lon}`}
                value={draft.earth}
                stations={props.stations}
                onChange={(next) => setDraft({ earth: next })}
              />
            </div>
          </div>

          {isDraftPoint ? (
            <div className="conditions-empty">
              <strong>Site conditions</strong>
              <p>Available after applying point {letter}.</p>
            </div>
          ) : (
            <>
              <dl className="stats">
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
              </dl>

              <div className="mission-time">
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
                  <p className="countdowns" aria-label="Live status">
                    {countdowns(live)}
                  </p>
                ) : (
                  <Pending label="Loading Sun and Earth positions…" />
                )}
              </div>

              <div className="whole-mission">
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
              </div>
            </>
          )}

          {error && (draft.lat !== '' || draft.lon !== '' || !isDraftPoint) && <p className="field-error">{error}</p>}
          <button type="submit" className={canApply ? 'apply apply-ready' : 'apply'} disabled={!canApply}>
            ✓ {pending || isDraftPoint ? `Apply point ${letter}` : `Point ${letter} applied`}
          </button>
        </form>
      )}
    </section>
  )
}

function LassoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 9c0-3 3-5 7-5s6 2 6 4.5S14 13 10 13c-2 0-3.5-.4-4.5-1" />
      <path d="M5.5 12c-1.2.8-1.5 2.2-.6 3.2.8.9 2.3.9 3.1-.1M8 15.2 7 18" />
    </svg>
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

function TargetIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="8" r="4" />
      <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
    </svg>
  )
}
