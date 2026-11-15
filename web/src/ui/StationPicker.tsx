import { FieldHelp } from './FieldHelp'
import { useEffect, useId, useRef, useState } from 'react'
import { normalizeStation, sameStation, stationLabel, type StationPreset } from '../api/stations'
import type { StationPoint } from '../api/types'

import { displayPresets, stationNetworks } from './stationNetworks'

export interface StationPickerProps {
  value: StationPoint[]
  presets: readonly StationPreset[]
  onChange: (next: StationPoint[]) => void
}

const NUMBER = /^-?\d+(?:\.\d+)?$/
const parseNumber = (text: string) => (NUMBER.test(text.trim()) ? Number(text.trim()) : null)

/** The Earth station the antenna talks to: a preset, or any point with an altitude and a mask. */
export function StationPicker({ value, presets, onChange }: StationPickerProps) {
  const networks = stationNetworks(presets)
  const entries = networks.flatMap((network) => network.stations)
  const extras = presets.filter((p) => !entries.some((entry) => entry.id === p.id))
  const first = value[0]
  const summary = value.length > 1 ? `${value.length} stations selected` : first ? stationLabel(first, displayPresets(presets)) : 'Choose stations'
  const id = useId()
  const disclosure = useRef<HTMLDetailsElement>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [lat, setLat] = useState(String(first?.lat_deg ?? ''))
  const [lon, setLon] = useState(String(first?.lon_deg ?? ''))
  const [alt, setAlt] = useState(String(first?.alt_m ?? 0))
  const [mask, setMask] = useState(String(first?.min_el_deg ?? 0))
  const selected = (point: StationPoint) => value.some((p) => sameStation(p, point))
  const toggle = (stations: readonly StationPreset[]) => {
    const checked = stations.every((p) => selected(p.point))
    const next = entries.filter((p) => stations.some((s) => s.id === p.id) ? !checked : selected(p.point))
    onChange(next.map((p) => p.point))
    setCustomOpen(false)
  }
  const closeMenu = () => {
    if (disclosure.current) disclosure.current.open = false
  }

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !disclosure.current?.contains(event.target)) closeMenu()
    }
    document.addEventListener('click', closeOutside)
    return () => document.removeEventListener('click', closeOutside)
  }, [])

  const numbers = [lat, lon, alt, mask].map(parseNumber)
  const draft = numbers.every((n) => n !== null)
    ? normalizeStation(numbers[0] as number, numbers[1] as number, numbers[2] as number, numbers[3] as number)
    : null
  const invalidField = (text: string, index: number) => text.trim() !== '' && numbers[index] === null
  const anyInvalid = [lat, lon, alt, mask].some((text, i) => invalidField(text, i)) || (numbers.every((n) => n !== null) && draft === null)
  const changed = draft !== null && (value.length !== 1 || !selected(draft))

  return (
    <div className="station-picker">
      <span className="field-label"><span id={id}>Earth Stations (Direct Contact)</span><FieldHelp field="Earth stations">Choose individual ground stations or an entire network. Select a station in the results to see its direct contact with this site.</FieldHelp></span>
      <details ref={disclosure} className="station-menu"
        onKeyDown={(e) => { if (e.key === 'Escape') { closeMenu(); disclosure.current?.querySelector('summary')?.focus() } }}>
        <summary aria-labelledby={`${id} ${id}-summary`}><span id={`${id}-summary`}>{summary}</span></summary>
        <div className="station-options">
          {networks.map((group) => {
            const count = group.stations.filter((p) => selected(p.point)).length
            return (
              <fieldset key={group.name}>
                <legend><label>
                  <input type="checkbox" checked={count === group.stations.length}
                    ref={(el) => { if (el) el.indeterminate = count > 0 && count < group.stations.length }}
                    onChange={() => toggle(group.stations)} />
                  {group.name}
                </label></legend>
                {group.stations.map((p) => (
                  <label key={p.id}><input type="checkbox" checked={selected(p.point)} onChange={() => toggle([p])} />{p.name}</label>
                ))}
              </fieldset>
            )
          })}
          <div className="station-other">
            {extras.map((p) => <button key={p.id} type="button" className="link-button" onClick={() => {
              onChange([p.point]); setCustomOpen(false); closeMenu()
            }}>{p.name}</button>)}
            <button type="button" className="link-button" onClick={() => {
              setLat(String(first?.lat_deg ?? '')); setLon(String(first?.lon_deg ?? ''))
              setAlt(String(first?.alt_m ?? 0)); setMask(String(first?.min_el_deg ?? 0))
              setCustomOpen(true); closeMenu()
            }}>Custom location…</button>
          </div>
        </div>
      </details>
      {customOpen && (
        // Not a <form>: the picker sits inside the point card's form, and a nested form would
        // submit (apply) the whole card. Enter in a field uses the values.
        <div
          className="station-custom"
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return
            e.preventDefault()
            if (draft !== null && changed) onChange([draft])
          }}
        >
          <div className="control">
            <span><label htmlFor={`${id}-lat`}>Latitude °</label><FieldHelp field="station latitude">Earth latitude in degrees. Use negative values south of the equator.</FieldHelp></span>
            <input
              type="text"
              inputMode="decimal"
              value={lat}
              placeholder="31.25"
              onChange={(e) => setLat(e.target.value)}
              aria-invalid={invalidField(lat, 0)}
              id={`${id}-lat`} aria-label="Station latitude"
            />
          </div>
          <div className="control">
            <span><label htmlFor={`${id}-lon`}>Longitude °</label><FieldHelp field="station longitude">Earth longitude from −180° to 180°. Use negative values west of Greenwich.</FieldHelp></span>
            <input
              type="text"
              inputMode="decimal"
              value={lon}
              placeholder="34.79"
              onChange={(e) => setLon(e.target.value)}
              aria-invalid={invalidField(lon, 1)}
              id={`${id}-lon`} aria-label="Station longitude"
            />
          </div>
          <div className="control">
            <span><label htmlFor={`${id}-alt`}>Altitude m</label><FieldHelp field="station altitude">Ground station height in metres above sea level, from −500 to 9,000 m.</FieldHelp></span>
            <input
              type="text"
              inputMode="decimal"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              aria-invalid={invalidField(alt, 2)}
              id={`${id}-alt`} aria-label="Station altitude"
            />
          </div>
          <div className="control">
            <span><label htmlFor={`${id}-mask`}>Lowest Moon elevation °</label><FieldHelp field="station elevation mask">Minimum angle above the station’s horizon for a link, from 0° to 45°.</FieldHelp></span>
            <input
              type="text"
              inputMode="decimal"
              value={mask}
              onChange={(e) => setMask(e.target.value)}
              aria-invalid={invalidField(mask, 3)}
              id={`${id}-mask`} aria-label="Station elevation mask"
            />
          </div>
          <button type="button" className="secondary" disabled={!changed} onClick={() => draft !== null && onChange([draft])}>
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
