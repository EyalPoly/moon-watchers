const MAP_LAYERS = ['Relief', 'Illumination', 'Earth DTE', 'Slope', 'Dust'] as const
export type MapLayer = (typeof MAP_LAYERS)[number]

interface LayersBoxProps {
  selected: MapLayer
  onSelect: (layer: MapLayer) => void
}

export function LayersBox({ selected, onSelect }: LayersBoxProps) {
  return (
    <section className="layers-box" aria-label="Map layers and key">
      <div className="layers-row" role="radiogroup" aria-labelledby="visible-layers-label">
        <span className="box-label" id="visible-layers-label">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M8 2 1.5 5.5 8 9l6.5-3.5Z M1.5 8.5 8 12l6.5-3.5 M1.5 11 8 14.5l6.5-3.5" />
          </svg>
          VISIBLE LAYERS
        </span>
        <div className="layer-options">
          {MAP_LAYERS.map((layer) => (
            <label key={layer} className="layer-choice">
              <input
                type="radio"
                name="visible-layer"
                value={layer}
                checked={selected === layer}
                onChange={() => onSelect(layer)}
              />
              {layer}
            </label>
          ))}
        </div>
      </div>
      <div className="layers-row">
        <span className="box-label">MAP KEY</span>
        <ul className="map-key">
          <li>
            <span className="key-psr" aria-hidden="true" /> PSR (Potential water ice)
          </li>
          <li>
            <span className="key-steep" aria-hidden="true">
              ▲
            </span>{' '}
            Steep terrain / No Earth link
          </li>
          <li>
            <span className="key-landing" aria-hidden="true" /> Landing site
          </li>
          <li>
            <span className="key-sensitive" aria-hidden="true">
              ◆
            </span>{' '}
            Sensitive research
          </li>
        </ul>
      </div>
      <p className="layers-note">Additional map layers and markers appear as their data becomes available.</p>
    </section>
  )
}
