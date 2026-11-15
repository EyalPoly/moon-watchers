import { DATA_LAYERS, type DataLayerId } from '../map/QuickmapLayers'

const MAP_LAYERS = ['Relief', 'PSR', 'Earth DTE', 'Slope', 'Dust'] as const
const POLYGON_LAYERS = ['None', 'Planning boundary', 'Selected region', 'Ranked areas'] as const
export type MapLayer = (typeof MAP_LAYERS)[number]
export type PolygonLayer = (typeof POLYGON_LAYERS)[number]

interface Props {
  selected: MapLayer
  onSelect: (layer: MapLayer) => void
  overlay: PolygonLayer
  onOverlay: (layer: PolygonLayer) => void
  dataLayers: readonly DataLayerId[]
  onDataLayers: (layers: DataLayerId[]) => void
}

function LayerChoices<T extends string>({ label, options, value, select }: {
  label: string; options: readonly T[]; value: T; select: (v: T) => void
}) {
  return (
    <fieldset className="layer-group" role="radiogroup" aria-label={label}>
      <legend className="box-label">{label}</legend>
      <div className="layer-options">{options.map((option) =>
        <label key={option} className="layer-choice">
          <input type="radio" name={label} value={option} checked={value === option} onChange={() => select(option)} />
          {option}
        </label>
      )}</div>
    </fieldset>
  )
}

export function LayersBox({ selected, onSelect, overlay, onOverlay, dataLayers, onDataLayers }: Props) {
  return (
    <section className="layers-box" aria-label="Map layers and key">
      <LayerChoices label="Maps Layers" options={MAP_LAYERS} value={selected} select={onSelect} />
      <fieldset className="layer-group" aria-label="Data Layers">
        <legend className="box-label">Data Layers</legend>
        <div className="layer-options">{DATA_LAYERS.map(({ id, label }) =>
          <label key={id} className="layer-choice">
            <input type="checkbox" checked={dataLayers.includes(id)}
              onChange={(e) => onDataLayers(e.target.checked ? [...dataLayers, id] : dataLayers.filter((d) => d !== id))} />
            {label}
          </label>
        )}</div>
      </fieldset>
      <LayerChoices label="Polygons Layers" options={POLYGON_LAYERS} value={overlay} select={onOverlay} />
      <div className="map-key-row">
        <span className="box-label">Map Key</span>
        <ul className="map-key">
          <li><span className="key-landing" aria-hidden="true" />Site</li>
          <li><span className="key-psr" aria-hidden="true" />PSR (potential water ice)</li>
          <li><span className="key-steep" aria-hidden="true">▲</span>Steep terrain / no Earth link</li>
          <li><span className="key-sensitive" aria-hidden="true">◆</span>Sensitive research</li>
          <li><span className="key-graticule" aria-hidden="true" />5° latitude / longitude</li>
          {overlay === 'Planning boundary' && <li><span className="key-boundary" aria-hidden="true" />Planning boundary</li>}
          {overlay === 'Selected region' && <li><span className="key-region" aria-hidden="true" />Selected region</li>}
          {overlay === 'Ranked areas' && <li><span className="key-cell" aria-hidden="true" />Ranked area</li>}
        </ul>
      </div>
    </section>
  )
}
