// "Visible layers" and "Map key" under the explorer (UI design). Layers with checkboxes are
// overlays; the key rows only explain the map's symbols. Until the engine's grids exist,
// the overlays can't be switched on, and only landing sites appear on the map.

const LAYERS = ['Illumination', 'Resources', 'Hazard']

export function LayersBox() {
  return (
    <section className="layers-box" aria-label="Map layers and key">
      <div className="layers-row">
        <span className="box-label">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M8 2 1.5 5.5 8 9l6.5-3.5Z M1.5 8.5 8 12l6.5-3.5 M1.5 11 8 14.5l6.5-3.5" />
          </svg>
          VISIBLE LAYERS
        </span>
        {LAYERS.map((layer) => (
          <label key={layer} className="layer-check" title={`${layer}: coming with the engine's map grids`}>
            <input type="checkbox" disabled /> {layer}
          </label>
        ))}
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
      <p className="layers-note">Overlays and markers other than landing sites appear once their data is available.</p>
    </section>
  )
}
