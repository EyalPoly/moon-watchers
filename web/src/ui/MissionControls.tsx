import { MISSION_RANGE, type MissionState } from '../state/urlState'
import { LUNAR_DAY_MS, formatIsoMinute, parseIsoMinute, snapToStep } from '../time'
import { HeightControl } from './HeightControl'
import { MissionLength } from './MissionLength'

export interface MissionControlsProps {
  mission: MissionState
  /** push: a real action that Back should undo. replace: a continuous tweak. */
  onChange: (next: Partial<MissionState>, mode: 'push' | 'replace') => void
}

const FIRST_MS = parseIsoMinute(MISSION_RANGE.first) as number
const LAST_MS = parseIsoMinute(MISSION_RANGE.last) as number

// <input type="datetime-local"> has no time zone; the app treats its value as UTC.
const toInput = (iso: string) => iso.slice(0, 16)
const fromInput = (value: string) => {
  const ms = parseIsoMinute(`${value}Z`)
  return ms === null ? null : formatIsoMinute(snapToStep(ms))
}

export function MissionControls({ mission, onChange }: MissionControlsProps) {
  const t0Ms = parseIsoMinute(mission.t0) as number
  const canAddLunarDay = t0Ms + LUNAR_DAY_MS <= LAST_MS
  return (
    <div className="controls">
      <label className="control control-wide">
        <span>Landing (UTC)</span>
        <span className="control-row">
          <input
            type="datetime-local"
            step={600}
            min={toInput(MISSION_RANGE.first)}
            max={toInput(MISSION_RANGE.last)}
            value={toInput(mission.t0)}
            onChange={(e) => {
              const t0 = fromInput(e.target.value)
              const ms = t0 === null ? null : parseIsoMinute(t0)
              if (t0 !== null && ms !== null && ms >= FIRST_MS && ms <= LAST_MS) onChange({ t0 }, 'push')
            }}
          />
          <button
            type="button"
            className="secondary"
            disabled={!canAddLunarDay}
            title="+1 lunar day: move the landing 29 d 12 h 40 min later, to the same Sun angle"
            aria-label="+1 lunar day"
            onClick={() => onChange({ t0: formatIsoMinute(t0Ms + LUNAR_DAY_MS) }, 'push')}
          >
            +29.5 d
          </button>
        </span>
      </label>
      <MissionLength
        key={mission.days}
        days={mission.days}
        onChange={(days) => onChange({ days, tau: 0 }, 'push')}
      />
      <HeightControl label="Panel" value={mission.panel} onChange={(panel) => onChange({ panel }, 'replace')} />
      <HeightControl label="Antenna" value={mission.antenna} onChange={(antenna) => onChange({ antenna }, 'replace')} />
    </div>
  )
}
