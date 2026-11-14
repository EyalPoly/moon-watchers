import { useState } from 'react'
import { HEIGHT_RANGE } from '../api/heights'

export interface HeightControlProps {
  label: string
  /** Height in meters, in whole centimetres. */
  value: number
  onChange: (next: number) => void
}

const CENTIMETRES = /^\d+(?:\.\d{1,2})?$/

function parseHeight(text: string): number | null {
  const trimmed = text.trim()
  if (!CENTIMETRES.test(trimmed)) return null
  const v = Number(trimmed)
  return v >= HEIGHT_RANGE.min && v <= HEIGHT_RANGE.max ? v : null
}

/** A height from 1 to 10 m: a slider for coarse moves and a field for exact values like 2.55. */
export function HeightControl({ label, value, onChange }: HeightControlProps) {
  // While the slider moves, its value is a local draft; it is committed on release.
  const [draft, setDraft] = useState<number | null>(null)
  const [typed, setTyped] = useState<string | null>(null)
  const shown = draft ?? value
  const parsed = typed === null ? null : parseHeight(typed)
  const invalid = typed !== null && typed.trim() !== '' && parsed === null

  const commitSlider = () => {
    if (draft !== null && draft !== value) onChange(draft)
    setDraft(null)
  }
  const commitTyped = () => {
    if (parsed !== null && parsed !== value) onChange(parsed)
    setTyped(null)
  }

  return (
    <div className="control height-control">
      <span>
        {label} <span className="num">{shown.toFixed(2)} m</span>
      </span>
      <span className="control-row">
        <input
          type="range"
          min={HEIGHT_RANGE.min}
          max={HEIGHT_RANGE.max}
          step={0.01}
          value={shown}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={commitSlider}
          onKeyUp={commitSlider}
          onBlur={commitSlider}
          aria-label={`${label} height in meters`}
        />
        <input
          type="text"
          inputMode="decimal"
          className="height-input"
          value={typed ?? String(shown)}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTyped()
            if (e.key === 'Escape') setTyped(null)
          }}
          aria-invalid={invalid}
          aria-label={`${label} height in meters, exact value`}
        />
      </span>
      {invalid && <span className="field-error">1 to 10 m, at most two decimals.</span>}
    </div>
  )
}
