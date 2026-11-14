import type { BodyStatus, Change, LiveStatus, Tri } from '../state/series'
import { formatDuration, formatUtc } from '../time'

function countdown(change: Change, visible: Tri, setWord: string, riseWord: string): string {
  if (visible === null) {
    return change.kind === 'not-before'
      ? `Terrain unknown until at least ${formatUtc(change.ms)}`
      : `Status changes in ${formatDuration(change.inMs)}`
  }
  const word = visible ? setWord : riseWord
  if (change.kind === 'not-before') return `${word} not before ${formatUtc(change.ms)}`
  return `${word} in ${formatDuration(change.inMs)}`
}

const degrees = (value: number | null, digits = 2) => (value === null ? '—' : `${value.toFixed(digits)}°`)

function Row({
  name,
  body,
  setWord,
  riseWord,
  note,
}: {
  name: string
  body: BodyStatus
  setWord: string
  riseWord: string
  note?: string
}) {
  const state = body.visible === null ? 'unknown' : body.visible ? 'visible' : 'hidden'
  const text = state === 'unknown' ? 'Unknown (missing terrain)' : (note ?? (body.visible ? 'Visible' : 'Hidden'))
  const sign = body.clearance !== null && body.clearance >= 0 ? '+' : ''
  return (
    <div className={`live-row live-${state}`}>
      <div className="live-head">
        <span className="live-name">{name}</span>
        <span className={`live-state live-state-${state}`}>
          <span aria-hidden="true">{state === 'visible' ? '●' : state === 'hidden' ? '○' : '◌'}</span> {text}
        </span>
      </div>
      <dl className="live-values">
        <div>
          <dt>Elevation</dt>
          <dd className="num">{degrees(body.el)}</dd>
        </div>
        <div>
          <dt>Terrain</dt>
          <dd className="num">{degrees(body.horizon)}</dd>
        </div>
        <div>
          <dt>Clearance</dt>
          <dd className={`num ${body.clearance === null ? '' : body.clearance >= 0 ? 'pos' : 'neg'}`}>
            {body.clearance === null ? '—' : `${sign}${body.clearance.toFixed(2)}°`}
          </dd>
        </div>
      </dl>
      <p className="live-countdown">{countdown(body.change, body.visible, setWord, riseWord)}</p>
    </div>
  )
}

export function LivePanel({ status }: { status: LiveStatus }) {
  const sunNote =
    status.sun.visible && status.sun.litFraction !== null && status.sun.litFraction < 1
      ? `Partly visible (${Math.round(status.sun.litFraction * 100)}% of disk)`
      : undefined
  const earthNote = !status.earth.stationUp ? 'Station cannot see the Moon' : undefined
  return (
    <section className="live" aria-label="Live status">
      <Row name="Sun" body={status.sun} setWord="Sunset" riseWord="Sunrise" note={sunNote} />
      <Row name="Earth" body={status.earth} setWord="Earthset" riseWord="Earthrise" note={earthNote} />
    </section>
  )
}
