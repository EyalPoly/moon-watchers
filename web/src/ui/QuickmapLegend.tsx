import type { MapLayer } from './LayersBox'

const GEOMAP_LEGEND_URL = 'https://files.actgate.com/legends/sdr_geomap_oct2022.png'
const PSR_COLOR = '#1aa7cf'
// Sampled from QuickMap's "haze" palette; steeper slopes at the right.
const SLOPE_STOPS = ['#e0bfee', '#a395ce', '#6568af', '#263b8f', '#1f2f6f', '#5e594f', '#9d832f', '#f1bc05']

export function QuickmapLegend({ layer }: { layer: MapLayer }) {
  if (layer === 'Relief') return null
  return (
    <aside className="data-legend" aria-label="Map layer legend">
      {layer === 'TerrainSlope' && <section>
        <strong>TerrainSlope</strong>
        <i className="data-legend-ramp" aria-hidden="true" style={{ background: `linear-gradient(to right, ${SLOPE_STOPS.join(', ')})` }} />
        <span className="data-legend-ends"><small>0° · level</small><small>15°+ · steep</small></span>
      </section>}
      {layer === 'PSR' && <section>
        <strong>PSR (1 Km^2 or larger)</strong>
        <span className="data-legend-row"><i aria-hidden="true" style={{ background: PSR_COLOR }} />Permanently shadowed region</span>
      </section>}
      {layer === 'South Pole Geomorphic Map' && <section>
        <details>
          <summary>South Pole Geomorphic Map</summary>
          <img src={GEOMAP_LEGEND_URL} alt="Geomorphic map units and features" />
        </details>
        <small>Covers only Artemis III areas 001 and 004.</small>
      </section>}
    </aside>
  )
}
