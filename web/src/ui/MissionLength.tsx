import { useState } from 'react'

export interface MissionLengthProps {
  /** Mission time on the Moon, in days (1–365, to 0.01 day). */
  days: number
  onChange: (days: number) => void
}

const PRESETS: [number, string][] = [
  [7, '7 days'],
  [14, '14 days'],
  [29.53, '1 lunar day'],
  [59.06, '2 lunar days'],
  [90, '90 days'],
  [180, '180 days'],
  [365, '1 year'],
]

const MIN_DAYS = 1
const MAX_DAYS = 365

/** How long the mission stays on the Moon: days and hours, or a preset. */
export function MissionLength({ days, onChange }: MissionLengthProps) {
  const [d, setD] = useState(String(Math.floor(days)))
  // Hours keep one decimal, so 29.53 days reads as 29 d 12.7 h and saves back unchanged.
  const [h, setH] = useState(String(Math.round((days - Math.floor(days)) * 240) / 10))
  const dN = Number(d)
  const hN = Number(h)
  const valid = d.trim() !== '' && h.trim() !== '' && Number.isInteger(dN) && Number.isFinite(hN) && hN >= 0 && hN < 24
  const total = valid ? Math.round((dN + hN / 24) * 100) / 100 : NaN
  const inRange = total >= MIN_DAYS && total <= MAX_DAYS
  const commit = () => {
    if (valid && inRange && total !== days) onChange(total)
  }
  const preset = PRESETS.find(([v]) => v === days)

  return (
    <div
      className="control control-wide mission-length"
      // Saved when focus leaves the days-and-hours pair (or on Enter), not between the two.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit()
      }}
    >
      <span>Time on the Moon</span>
      <span className="control-row">
        <label className="length-field">
          <input
            type="number"
            min={0}
            max={MAX_DAYS}
            step={1}
            value={d}
            onChange={(e) => setD(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            aria-label="Mission days"
            aria-invalid={!valid || !inRange}
          />
          <span>d</span>
        </label>
        <label className="length-field">
          <input
            type="number"
            min={0}
            max={23.9}
            step={0.1}
            value={h}
            onChange={(e) => setH(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            aria-label="Mission hours"
            aria-invalid={!valid || !inRange}
          />
          <span>h</span>
        </label>
        <select
          value={preset ? String(preset[0]) : ''}
          onChange={(e) => e.target.value && onChange(Number(e.target.value))}
          aria-label="Mission length preset"
        >
          <option value="">Presets…</option>
          {PRESETS.map(([v, label]) => (
            <option key={v} value={String(v)}>
              {label}
            </option>
          ))}
        </select>
      </span>
      {valid && !inRange ? (
        <span className="field-error">Between 1 day and 365 days.</span>
      ) : !valid ? (
        <span className="field-error">Whole days, and hours from 0 to 23.9.</span>
      ) : (
        <span className="length-total num">
          {exact(days)} on the Moon{preset ? ` · ${preset[1]}` : ''}
        </span>
      )}
    </div>
  )
}

/** "29 d 12 h 43 min" (days on the 10-minute grid, as the engine uses). */
function exact(days: number): string {
  const total = Math.round((days * 1440) / 10) * 10
  const d = Math.floor(total / 1440)
  const h = Math.floor((total % 1440) / 60)
  const m = total % 60
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ') || '0 min'
}
