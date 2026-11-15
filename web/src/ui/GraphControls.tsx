import { formatLatLon, pointId, POINT_AREA, type LatLon } from '../api/points'
import type { graphClock } from '../state/tickets'
import { formatUtc } from '../time'
import { CoordinateHelp } from './CoordinateHelp'

const POSITION_STEP = 0.1
const DIRECTIONS = [
  { name: 'north', glyph: '↑', lat: POSITION_STEP, lon: 0 },
  { name: 'west', glyph: '←', lat: 0, lon: -POSITION_STEP },
  { name: 'east', glyph: '→', lat: 0, lon: POSITION_STEP },
  { name: 'south', glyph: '↓', lat: -POSITION_STEP, lon: 0 },
] as const

export function GraphControls({ location, clock, onMove, onDay }: {
  location: LatLon
  clock: ReturnType<typeof graphClock>
  onMove: (id: string) => void
  onDay: (day: number) => void
}) {
  const dayLabel = Number(clock.day.toFixed(2))
  const timeText = formatUtc(clock.nowMs)
  return (
    <>
      <div className="graph-position" role="group" aria-label="Move site coordinates">
        <div className="graph-arrows">
          {DIRECTIONS.map(({ name, glyph, lat, lon }) => {
            const nextLat = Math.max(POINT_AREA.minLat, Math.min(POINT_AREA.maxLat, location.lat + lat))
            return <button key={name} type="button" className={`nudge-${name}`}
              disabled={lat !== 0 && nextLat === location.lat} aria-label={`Move site ${name}`}
              title={`Move ${POSITION_STEP}° ${name}`} onClick={() => onMove(pointId(nextLat, location.lon + lon))}>
              {glyph}
            </button>
          })}
        </div>
        <div className="graph-location">
          <CoordinateHelp step={POSITION_STEP} />
          <span className="graph-coords num">{formatLatLon(location.lat, location.lon)}</span>
        </div>
      </div>
      <label className="graph-time">
        <span>Lunar Day <strong className="num">{dayLabel}</strong></span>
        <input type="range" aria-label="Graph time in lunar days" aria-valuetext={`Lunar day ${dayLabel}, ${timeText}`}
          min={clock.minDay} max={clock.maxDay} step={1} value={Math.floor(clock.day)}
          onChange={(e) => onDay(Number(e.target.value))} />
        <time className="graph-date num" dateTime={new Date(clock.nowMs).toISOString()}>{timeText}</time>
      </label>
    </>
  )
}
