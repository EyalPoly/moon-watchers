import type { BodyStatus, Change, LiveStatus } from '../state/series'
import { formatDuration, formatUtc } from '../time'

function countdown(change: Change, visible: boolean, setWord: string, riseWord: string): string {
  const word = visible ? setWord : riseWord
  if (change.kind === 'not-before') return `${word} not before ${formatUtc(change.ms)}`
  return `${word} in ${formatDuration(change.inMs)}`
}

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
  const state = body.visible ? 'visible' : 'hidden'
  return (
    <div className={`live-row live-${state}`}>
      <div className="live-head">
        <span className="live-name">{name}</span>
        <span className={`live-state live-state-${state}`}>
          <span aria-hidden="true">{body.visible ? '●' : '○'}</span> {note ?? (body.visible ? 'Visible' : 'Hidden')}
        </span>
      </div>
      <dl className="live-values">
        <div>
          <dt>Elevation</dt>
          <dd className="num">{body.el.toFixed(2)}°</dd>
        </div>
        <div>
          <dt>Terrain</dt>
          <dd className="num">{body.horizon.toFixed(2)}°</dd>
        </div>
        <div>
          <dt>Clearance</dt>
          <dd className={`num ${body.clearance >= 0 ? 'pos' : 'neg'}`}>
            {body.clearance >= 0 ? '+' : ''}
            {body.clearance.toFixed(2)}°
          </dd>
        </div>
      </dl>
      <p className="live-countdown">{countdown(body.change, body.visible, setWord, riseWord)}</p>
    </div>
  )
}

export function LivePanel({ status }: { status: LiveStatus }) {
  const sunNote =
    status.sun.visible && status.sun.litFraction < 1
      ? `Partly visible (${Math.round(status.sun.litFraction * 100)}% of disk)`
      : undefined
  const earthNote = !status.earth.stationUp ? 'No station sees the Moon' : undefined
  return (
    <section className="live" aria-label="Live status">
      <Row name="Sun" body={status.sun} setWord="Sunset" riseWord="Sunrise" note={sunNote} />
      <Row name="Earth" body={status.earth} setWord="Earthset" riseWord="Earthrise" note={earthNote} />
    </section>
  )
}
