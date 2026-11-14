import { useState } from 'react'
import { normalizeStation, sameStation, type StationPreset } from '../api/stations'
import type { StationPoint } from '../api/types'

export interface StationPickerProps {
  value: StationPoint
  presets: readonly StationPreset[]
  onChange: (next: StationPoint) => void
}

const NUMBER = /^-?\d+(?:\.\d+)?$/
const parseNumber = (text: string) => (NUMBER.test(text.trim()) ? Number(text.trim()) : null)

/** The Earth station the antenna talks to: a preset, or any point with an altitude and a mask. */
export function StationPicker({ value, presets, onChange }: StationPickerProps) {
  // Custom values are typed as drafts and applied together.
  const [lat, setLat] = useState(String(value.lat_deg))
  const [lon, setLon] = useState(String(value.lon_deg))
  const [alt, setAlt] = useState(String(value.alt_m))
  const [mask, setMask] = useState(String(value.min_el_deg))
  const preset = presets.find((p) => sameStation(p.point, value))
  const [customOpen, setCustomOpen] = useState(preset === undefined)

  const numbers = [lat, lon, alt, mask].map(parseNumber)
  const draft = numbers.every((n) => n !== null)
    ? normalizeStation(numbers[0] as number, numbers[1] as number, numbers[2] as number, numbers[3] as number)
    : null
  const invalidField = (text: string, index: number) => text.trim() !== '' && numbers[index] === null
  const anyInvalid = [lat, lon, alt, mask].some((text, i) => invalidField(text, i)) || (numbers.every((n) => n !== null) && draft === null)
  const changed = draft !== null && !sameStation(draft, value)

  return (
    <div className="station-picker">
      <label className="control">
        <span>Earth station (direct contact)</span>
        <select
          value={customOpen || preset === undefined ? 'custom' : preset.id}
          onChange={(e) => {
            const chosen = presets.find((p) => p.id === e.target.value)
            if (chosen === undefined) {
              setCustomOpen(true)
              return
            }
            setCustomOpen(false)
            onChange(chosen.point)
          }}
          aria-label="Earth station"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="custom">Custom location…</option>
        </select>
      </label>
      {(customOpen || preset === undefined) && (
        // Not a <form>: the picker sits inside the point card's form, and a nested form would
        // submit (apply) the whole card. Enter in a field uses the values.
        <div
          className="station-custom"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (draft !== null && changed) onChange(draft)
          }}
        >
          <label className="control">
            <span>Latitude °</span>
            <input
              type="text"
              inputMode="decimal"
              value={lat}
              placeholder="31.25"
              onChange={(e) => setLat(e.target.value)}
              aria-invalid={invalidField(lat, 0)}
              aria-label="Station latitude"
            />
          </label>
          <label className="control">
            <span>Longitude °</span>
            <input
              type="text"
              inputMode="decimal"
              value={lon}
              placeholder="34.79"
              onChange={(e) => setLon(e.target.value)}
              aria-invalid={invalidField(lon, 1)}
              aria-label="Station longitude"
            />
          </label>
          <label className="control">
            <span>Altitude m</span>
            <input
              type="text"
              inputMode="decimal"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              aria-invalid={invalidField(alt, 2)}
              aria-label="Station altitude"
            />
          </label>
          <label className="control">
            <span>Lowest Moon elevation °</span>
            <input
              type="text"
              inputMode="decimal"
              value={mask}
              onChange={(e) => setMask(e.target.value)}
              aria-invalid={invalidField(mask, 3)}
              aria-label="Station elevation mask"
            />
          </label>
          <button type="button" className="secondary" disabled={!changed} onClick={() => draft !== null && onChange(draft)}>
            Use
          </button>
          {anyInvalid && (
            <p className="field-error">
              Latitude −90 to 90, longitude −180 to 180, altitude −500 to 9000 m, elevation 0 to 45°.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
