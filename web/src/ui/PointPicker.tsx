import { useState } from 'react'
import { POINT_AREA, inPointArea, parsePointId, pointId } from '../api/points'
import type { Site } from '../api/types'

export interface PointPickerProps {
  value: string | null
  /** Catalog sites. */
  sites: readonly Site[]
  onChange: (siteId: string | null) => void
}

const parse = (text: string) => {
  const v = Number(text.trim())
  return text.trim() !== '' && Number.isFinite(v) ? v : null
}

/** A ticket's point: a catalog site, or a new site anywhere in the area by lat/lon. */
export function PointPicker({ value, sites, onChange }: PointPickerProps) {
  const current = value === null ? null : parsePointId(value)
  const [custom, setCustom] = useState(current !== null)
  const [lat, setLat] = useState(current ? String(current.lat) : '')
  const [lon, setLon] = useState(current ? String(current.lon) : '')
  const latV = parse(lat)
  const lonV = parse(lon)
  const valid = latV !== null && lonV !== null && inPointArea(latV, lonV)
  const id = valid ? pointId(latV, lonV) : null
  const touched = lat !== '' || lon !== ''

  return (
    <div className="point-picker">
      <label className="site-picker">
        <span className="control-caption">Point</span>
        <select
          value={custom ? 'custom' : (value ?? '')}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'custom') {
              setCustom(true)
              return
            }
            setCustom(false)
            onChange(v || null)
          }}
          aria-label="Site"
        >
          <option value="">Choose a site</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="custom">New site by lat, lon…</option>
        </select>
      </label>
      {custom && (
        <form
          className="station-custom"
          onSubmit={(e) => {
            e.preventDefault()
            if (id && id !== value) onChange(id)
          }}
        >
          <label className="control">
            <span>Latitude °</span>
            <input
              type="text"
              inputMode="decimal"
              value={lat}
              placeholder="-87.5"
              onChange={(e) => setLat(e.target.value)}
              aria-label="Site latitude"
              aria-invalid={touched && !valid}
            />
          </label>
          <label className="control">
            <span>Longitude °</span>
            <input
              type="text"
              inputMode="decimal"
              value={lon}
              placeholder="45"
              onChange={(e) => setLon(e.target.value)}
              aria-label="Site longitude"
              aria-invalid={touched && !valid}
            />
          </label>
          <button type="submit" className="secondary" disabled={!id || id === value}>
            Add site
          </button>
          {touched && !valid && (
            <p className="field-error">
              Latitude {POINT_AREA.minLat}° to {POINT_AREA.maxLat}° (the south-pole area), longitude −180° to 180°.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
