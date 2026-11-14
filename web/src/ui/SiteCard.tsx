import type { Site } from '../api/types'
import { SampleTag } from './SampleTag'

export interface SiteCardProps {
  siteId: string | null
  sites: readonly Site[]
  onChange: (id: string | null) => void
  isSample: boolean
  site?: Site
}

export function SiteCard({ siteId, sites, onChange, isSample, site }: SiteCardProps) {
  const selected = site?.id === siteId ? site : sites.find((s) => s.id === siteId)
  return (
    <section className="site-card" aria-label="Site">
      <label>
        Site{' '}
        <select value={siteId ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Choose a site</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <div>
          <h2>{selected.name}</h2>
          <dl>
            <dt>Category</dt>
            <dd>{selected.category}</dd>
            <dt>Location</dt>
            <dd>
              {Math.abs(selected.lat_deg).toFixed(2)}°S, {Math.abs(selected.lon_deg).toFixed(2)}°
              {selected.lon_deg < 0 ? 'W' : 'E'}
            </dd>
            <dt>Slope</dt>
            <dd>
              {selected.slope_deg.toFixed(1)}° over {selected.slope_baseline_m} m
            </dd>
          </dl>
          {isSample && <SampleTag />}
        </div>
      )}
    </section>
  )
}
