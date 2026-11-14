import { useState } from 'react'
import type { Meta } from '../api/types'
import type { EarthStationChoice } from '../state/tickets'

export interface StationPickerProps {
  value: EarthStationChoice
  stations: Meta['stations']
  onChange: (next: EarthStationChoice) => void
}

const parseCoord = (text: string, limit: number) => {
  const v = Number(text.trim())
  return text.trim() !== '' && Number.isFinite(v) && Math.abs(v) <= limit ? Math.round(v * 100) / 100 : null
}

/** Earth station for direct contact: all DSN sites, one by name, or any point by lat/lon. */
export function StationPicker({ value, stations, onChange }: StationPickerProps) {
  // Custom coordinates are typed as drafts and applied together.
  const [lat, setLat] = useState(value.lat?.toString() ?? '')
  const [lon, setLon] = useState(value.lon?.toString() ?? '')
  const [customOpen, setCustomOpen] = useState(value.station === 'custom')
  const latV = parseCoord(lat, 90)
  const lonV = parseCoord(lon, 180)
  const valid = latV !== null && lonV !== null
  const changed = value.station !== 'custom' || latV !== value.lat || lonV !== value.lon
  const apply = () => {
    if (valid && changed) onChange({ station: 'custom', lat: latV, lon: lonV })
  }

  return (
    <div className="station-picker">
      <label className="control">
        <span>Earth station (direct contact)</span>
        <select
          value={customOpen ? 'custom' : value.station}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'custom') {
              setCustomOpen(true)
              return
            }
            setCustomOpen(false)
            onChange({ station: v as EarthStationChoice['station'], lat: null, lon: null })
          }}
          aria-label="Earth station"
        >
          <option value="any">All DSN sites</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="custom">Custom location (lat, lon)…</option>
        </select>
      </label>
      {customOpen && (
        // Not a <form>: the picker sits inside the point card's form, and a nested form
        // would submit (apply) the whole card. Enter in a field uses the coordinates.
        <div
          className="station-custom"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            apply()
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
              aria-invalid={lat !== '' && latV === null}
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
              aria-invalid={lon !== '' && lonV === null}
              aria-label="Station longitude"
            />
          </label>
          <button type="button" className="secondary" onClick={apply} disabled={!valid || !changed}>
            Use
          </button>
          {(lat !== '' && latV === null) || (lon !== '' && lonV === null) ? (
            <p className="field-error">Latitude −90 to 90, longitude −180 to 180.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
