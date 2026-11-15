import { useState, type ReactNode } from 'react'
import type { Meta } from '../api/types'
import { SCORE_DEFAULTS, isCustom, type ScoreSettings } from '../api/scoreSettings'

type Spec = Meta['score']
type SettingSpec = Spec['settings'][number]
type Key = keyof ScoreSettings

export interface ScoreSettingsPanelProps {
  spec: Spec
  value: ScoreSettings
  /** Proposes a slider edit to the current settings draft. */
  onChange: (s: ScoreSettings) => void
  /** Commits the control value to the current settings draft. */
  onCommit: (s: ScoreSettings) => void
}

const CUSTOM = 'custom'
const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i])

function refusal(s: ScoreSettings): { key: Key; message: string } | null {
  if (!s.w.some((x) => x > 0)) return { key: 'w', message: 'At least one weight must be above 0.' }
  if (s.slope[0] > s.slope[1]) return { key: 'slope', message: 'Good slope cannot be above bad slope.' }
  if (s.colors[1] > s.colors[0]) return { key: 'colors', message: 'Amber cannot be above green.' }
  return null
}

const withUnit = (v: number, unit: string) => (unit === '' ? String(v) : unit === '°' ? `${v}°` : `${v} ${unit}`)
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function parseTyped(text: string, spec: SettingSpec): number | null {
  const t = text.trim()
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null
  const v = Number(t)
  const n = v / spec.step
  return v >= spec.min && v <= spec.max && Math.abs(n - Math.round(n)) < 1e-6 ? v : null
}

interface RangeFieldProps {
  label: string
  spec: SettingSpec
  value: number
  withNumber: boolean
  onDrag: (v: number) => void
  onRelease: () => void
  onTyped: (v: number) => void
}

function RangeField({ label, spec, value, withNumber, onDrag, onRelease, onTyped }: RangeFieldProps) {
  const [typed, setTyped] = useState<string | null>(null)
  const parsed = typed === null ? null : parseTyped(typed, spec)
  const invalid = typed !== null && parsed === null

  const commitTyped = () => {
    if (parsed === null) return
    setTyped(null)
    if (parsed !== value) onTyped(parsed)
  }

  return (
    <div className="setting-field">
      <span className="setting-field-label">
        {label} <span className="num">{withUnit(value, spec.unit)}</span>
      </span>
      <span className="control-row">
        <input
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(e) => onDrag(Number(e.target.value))}
          onPointerUp={onRelease}
          onKeyUp={onRelease}
          onBlur={onRelease}
          aria-label={label}
        />
        {withNumber && (
          <input
            type="text"
            inputMode="decimal"
            className="setting-input"
            value={typed ?? String(value)}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={commitTyped}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitTyped() }
              if (e.key === 'Escape') setTyped(null)
            }}
            aria-invalid={invalid}
            aria-label={`${label}, exact value`}
          />
        )}
      </span>
      {invalid && (
        <span className="field-error">
          {`${spec.min} to ${withUnit(spec.max, spec.unit)} in steps of ${spec.step}.`}
        </span>
      )}
    </div>
  )
}

/** Every range, step, label and preset comes from the server's score description. */
export function ScoreSettingsPanel({ spec, value, onChange, onCommit }: ScoreSettingsPanelProps) {
  // While a slider moves, its value is a local draft; the parent follows through onChange.
  const [draft, setDraft] = useState<ScoreSettings | null>(null)
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({})
  const shown = draft ?? value
  const setting = (key: Key) => spec.settings.find((s) => s.key === key)

  const propose = (key: Key, next: ScoreSettings, phase: 'drag' | 'commit') => {
    const refused = refusal(next)
    if (refused) {
      setErrors((e) => ({ ...e, [refused.key]: refused.message }))
      return
    }
    setErrors((e) => ({ ...e, [key]: undefined }))
    if (phase === 'drag') {
      setDraft(next)
      onChange(next)
    } else {
      setDraft(null)
      onCommit(next)
    }
  }

  const release = () => {
    if (draft === null) return
    setDraft(null)
    onCommit(draft)
  }

  const withKey = <K extends Key>(key: K, v: ScoreSettings[K]): ScoreSettings => ({ ...shown, [key]: v })
  const withEntry = <K extends 'w' | 'slope' | 'colors'>(key: K, i: number, v: number) =>
    withKey(key, shown[key].map((x, j) => (j === i ? v : x)) as ScoreSettings[K])

  const changed = (key: Key) => isCustom({ ...SCORE_DEFAULTS, [key]: shown[key] })

  const row = (key: Key, title: string, children: ReactNode, showTitle = true) => (
    <div className="setting" data-changed={changed(key)} key={key}>
      <div className="setting-head">
        {showTitle && <span className="setting-title">{title}</span>}
        {changed(key) && (
          <>
            <span className="setting-mark">changed</span>
            <button
              type="button"
              className="link-button"
              aria-label={`Reset ${title}`}
              onClick={() => propose(key, { ...shown, [key]: SCORE_DEFAULTS[key] }, 'commit')}
            >
              Reset
            </button>
          </>
        )}
      </div>
      {children}
      {errors[key] && (
        <span className="field-error" role="alert">
          {errors[key]}
        </span>
      )}
    </div>
  )

  const single = (key: 'sun_req' | 'margin') => {
    const s = setting(key)
    if (!s) return null
    return row(
      key,
      s.label,
      <RangeField
        label={s.label}
        spec={s}
        value={shown[key]}
        withNumber
        onDrag={(v) => propose(key, withKey(key, v), 'drag')}
        onRelease={release}
        onTyped={(v) => propose(key, withKey(key, v), 'commit')}
      />,
      false,
    )
  }

  // The server describes a group as "Title: first, second, third".
  const group = (key: 'slope' | 'colors') => {
    const s = setting(key)
    if (!s) return null
    const [title, rest = ''] = s.label.split(': ')
    return row(
      key,
      title,
      rest.split(', ').map((part, i) => (
        <RangeField
          key={part}
          label={sentence(part)}
          spec={s}
          value={shown[key][i]}
          withNumber
          onDrag={(v) => propose(key, withEntry(key, i, v), 'drag')}
          onRelease={release}
          onTyped={(v) => propose(key, withEntry(key, i, v), 'commit')}
        />
      )),
    )
  }

  const weights = setting('w')
  const psr = setting('psr')
  const preset = spec.presets.find((p) => sameList(p.weights, shown.w))

  return (
    <div className="settings-form">
      {weights &&
        row(
          'w',
          weights.label,
          <>
            <label className="setting-preset">
              <span>Preset</span>
              <select
                aria-label="Weight preset"
                value={preset?.id ?? CUSTOM}
                onChange={(e) => {
                  const chosen = spec.presets.find((p) => p.id === e.target.value)
                  if (chosen) propose('w', withKey('w', chosen.weights as ScoreSettings['w']), 'commit')
                }}
              >
                {spec.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {!preset && <option value={CUSTOM}>Custom</option>}
              </select>
            </label>
            {spec.grades.map((grade, i) => (
              <RangeField
                key={grade.id}
                label={grade.label}
                spec={weights}
                value={shown.w[i]}
                withNumber={false}
                onDrag={(v) => propose('w', withEntry('w', i, v), 'drag')}
                onRelease={release}
                onTyped={(v) => propose('w', withEntry('w', i, v), 'commit')}
              />
            ))}
          </>,
        )}
      {single('sun_req')}
      {group('slope')}
      {psr &&
        row(
          'psr',
          psr.label,
          <label className="setting-switch">
            <input
              type="checkbox"
              role="switch"
              checked={shown.psr}
              onChange={(e) => propose('psr', withKey('psr', e.target.checked), 'commit')}
              aria-label={psr.label}
            />
            <span>{psr.label}</span>
          </label>,
          false,
        )}
      {single('margin')}
      {group('colors')}
      <button type="button" className="secondary" disabled={!isCustom(shown)} onClick={() => { setDraft(null); setErrors({}); onCommit(SCORE_DEFAULTS) }}>
        Reset all
      </button>
    </div>
  )
}
