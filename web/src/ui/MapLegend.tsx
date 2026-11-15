import type { Site } from '../api/types'
import { gradeColor } from '../map/RegionOverlay'
import type { MapLayer, PolygonLayer } from './LayersBox'

const UNKNOWN = '#89959c'
const SLOPE_SCALE = { hue: 32, max: 30, unit: '°', label: 'Local Slope', low: '0° · level', high: '30°+ · steep' }

const shade = (scale: typeof SLOPE_SCALE, value: number) =>
  `hsl(${scale.hue}, 76%, ${26 + 52 * Math.max(0, Math.min(1, value / scale.max))}%)`

export function mapReading(layer: MapLayer, site: Site) {
  const unknown = { color: UNKNOWN, text: 'Unknown' }
  if (layer === 'PSR') return site.in_psr == null ? unknown : site.in_psr
    ? { color: '#81b7ff', text: 'Inside PSR' } : { color: '#839778', text: 'Outside PSR' }
  if (layer !== 'TerrainSlope') return null
  return { color: shade(SLOPE_SCALE, site.slope_deg), text: `${Number(site.slope_deg.toFixed(1))}${SLOPE_SCALE.unit}` }
}

// Relative height colours in the LOLA colour hillshade. Light and dark within a hue
// show local relief; the tile metadata does not provide calibrated elevation breaks.
const RELIEF_BANDS = ['#45237d', '#2454c1', '#239bb4', '#4da75e', '#d3cb42', '#dc8139', '#ae4748', '#d7cbd3']

function Ramp({ start, end, low, high }: { start: string; end: string; low: string; high: string }) {
  return <div className="legend-ramp"><i aria-hidden="true" style={{ background: `linear-gradient(to right, ${start}, ${end})` }} />
    <span><small>{low}</small><small>{high}</small></span></div>
}

export function AreaGradeLegend() {
  return <div className="area-grade-key">
    <strong>Area Score · Sample</strong>
    <div className="grade-bands">{[[0, 39], [40, 69], [70, 100]].map(([low, high]) =>
      <Ramp key={low} start={gradeColor(low)} end={gradeColor(high)} low={String(low)} high={String(high)} />)}</div>
  </div>
}

export function MapLegend({ layer, overlay, hasRegion, legendUrl }: {
  layer: MapLayer; overlay: PolygonLayer; hasRegion: boolean; legendUrl?: string | null
}) {
  const scale = layer === 'TerrainSlope' ? SLOPE_SCALE : null
  return (
    <aside className="on-map-legend" aria-label="Map colour scale">
      {layer === 'Relief' && <>
        <strong>Terrain Elevation</strong>
        {legendUrl ? <img src={legendUrl} alt="Terrain elevation colour scale" /> : <>
          <div className="relief-bands" aria-hidden="true">{RELIEF_BANDS.map(color =>
            <i key={color} style={{ background: `linear-gradient(to top, color-mix(in srgb, ${color} 55%, black), ${color} 55%, color-mix(in srgb, ${color} 68%, white))` }} />)}</div>
          <div className="scale-ends"><small>Lower</small><small>Higher</small></div>
          <small>Light and dark show hillshading.</small>
        </>}
      </>}
      {layer === 'PSR' && <><strong>Permanent Shadow · At Sites</strong>
        <div className="psr-key">{[['#81b7ff', 'Inside'], ['#839778', 'Outside'], [UNKNOWN, 'Unknown']].map(([color, word]) =>
          <span key={word}><i style={{ background: color }} />{word}</span>)}</div></>}
      {scale && <><strong>{scale.label} · At Sites</strong>
        <Ramp start={shade(scale, 0)} end={shade(scale, scale.max)} low={scale.low} high={scale.high} /></>}
      {hasRegion && overlay === 'Ranked areas' && <AreaGradeLegend />}
      {!hasRegion && (overlay === 'Selected region' || overlay === 'Ranked areas') &&
        <small>Use Manual Selection and apply an area to show this overlay.</small>}
    </aside>
  )
}
