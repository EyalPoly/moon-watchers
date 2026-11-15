import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Site } from '../api/types'
import { MISSION_RANGE } from '../state/urlState'
import { LUNAR_DAY_MS, formatIsoMinute, formatUtc, parseIsoMinute, snapToStep } from '../time'
import { FieldHelp } from '../ui/FieldHelp'
import { formatLat, formatLon } from '../ui/points'
import { OrbitGlobe } from './OrbitGlobe'
import { directionsAt, loadOrbitYear } from './ephemeris'
import './orbit.css'

interface Props {
  utc: string
  onUtc: (value: string) => void
  sites: readonly Site[]
  onExplore: (site: string | null, utc: string) => void
}

const FIRST = Date.parse(MISSION_RANGE.first), LAST = Date.parse(MISSION_RANGE.last)

export function OrbitScreen({ utc, onUtc, sites, onExplore }: Props) {
  const [scrub, setScrub] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = sites.find(site => site.id === selectedId)
  const time = scrub ?? Date.parse(utc)
  const iso = formatIsoMinute(time)
  const year = new Date(time).getUTCFullYear()
  const dayStart = Date.parse(iso.slice(0, 10) + 'T00:00Z')
  const minute = (time - dayStart) / 60000
  const table = useQuery({
    queryKey: ['orbit-ephemeris', year], queryFn: ({ signal }) => loadOrbitYear(year, signal),
    staleTime: Infinity, retry: false,
  })
  const directions = useMemo(() => table.data ? directionsAt(table.data, year, time) : undefined, [table.data, year, time])

  function commit(value: number) {
    setScrub(null)
    if (Number.isFinite(value)) onUtc(formatIsoMinute(Math.min(LAST, Math.max(FIRST, snapToStep(value)))))
  }
  function changeFields(date: string, hour: string) {
    const value = parseIsoMinute(`${date}T${hour}Z`)
    if (value !== null && value >= FIRST && value <= LAST) commit(value)
  }
  function finishScrub() { if (scrub !== null) commit(scrub) }

  return <main className="orbit-screen" aria-label="Orbit">
    <section className="orbit-timebar" aria-label="Orbit date and time">
      <span className="orbit-caption">Landing date &amp; time</span>
      <label className="orbit-field"><input type="date" aria-label="Orbit date" value={iso.slice(0, 10)}
        min={MISSION_RANGE.first.slice(0, 10)} max={MISSION_RANGE.last.slice(0, 10)}
        onChange={e => changeFields(e.target.value, iso.slice(11, 16))} /></label>
      <label className="orbit-field"><input type="time" aria-label="Orbit time (UTC)" value={iso.slice(11, 16)} step={600}
        onChange={e => changeFields(iso.slice(0, 10), e.target.value)} /><span>UTC</span></label>
      <button type="button" className="orbit-day" disabled={time + LUNAR_DAY_MS > LAST}
        title="Advance one lunar day" aria-label="Advance one lunar day" onClick={() => commit(time + LUNAR_DAY_MS)}>↻ &nbsp;+29.5 d</button>
      <div className="orbit-hours">
        <span className="orbit-caption">Hours</span>
        <div><input type="range" aria-label="Hour of the selected UTC day" aria-valuetext={formatUtc(time)}
          min="0" max="1430" step="10" value={minute}
          onChange={e => setScrub(dayStart + Number(e.target.value) * 60000)}
          onPointerUp={e => commit(dayStart + Number(e.currentTarget.value) * 60000)}
          onKeyUp={finishScrub} onBlur={finishScrub} onPointerCancel={finishScrub} />
          <div className="orbit-ticks" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>23:50</span></div>
        </div>
      </div>
    </section>
    <div className="orbit-stage">
      <OrbitGlobe directions={directions} sites={sites} selected={selected} onSelect={site => setSelectedId(site?.id ?? null)} scrubbing={scrub !== null} />
      <header className="orbit-heading">
        <p className="eyebrow mono">01 &nbsp;/&nbsp; ORBIT</p>
        <div><h1>Lunar overview</h1><FieldHelp field="Lunar overview" symbol="i">Drag or use the arrow keys to rotate the Moon. Scroll or use the zoom buttons to see more detail.</FieldHelp></div>
        <p>{selected ? selected.name : 'South polar region'}</p>
        {selected && <small>{formatLat(selected.lat_deg)} &nbsp; {formatLon(selected.lon_deg)}</small>}
      </header>
      {table.isError ? <div className="orbit-notice" role="alert">Sky positions could not load. <button type="button" onClick={() => void table.refetch()}>Retry</button></div>
        : table.isPending && <div className="orbit-notice" role="status">Loading sky positions…</div>}
      <button type="button" className="orbit-explore" onClick={() => onExplore(selected?.id ?? null, iso)}>
        Explore South Pole <span aria-hidden="true">→</span>
      </button>
    </div>
    <footer className="orbit-footer">
      <span>Sun &amp; Earth directions · Distances not to scale</span>
      <span>Illustrative terrain shadows <span aria-hidden="true">·</span> <a href={`${import.meta.env.BASE_URL}orbit/credits.html`} target="_blank" rel="noreferrer">Data credits</a></span>
    </footer>
  </main>
}
