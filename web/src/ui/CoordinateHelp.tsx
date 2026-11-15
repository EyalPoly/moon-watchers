import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './coordinate-help.css'

function Diagram({ file, alt, height }: { file: string; alt: string; height: number }) {
  return (
    <figure>
      <img src={`${import.meta.env.BASE_URL}help/coordinates/${file}`} alt={alt} width={760} height={height} />
    </figure>
  )
}

export function CoordinateHelp({ step }: { step: number }) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useLayoutEffect(() => {
    if (open) dialog.current?.showModal()
  }, [open])

  return (
    <>
      <button ref={trigger} type="button" className="help-trigger coordinate-help-trigger"
        aria-label="Help for moving site coordinates" title="How latitude and longitude affect the horizon"
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>i</button>
      {open && createPortal(
        <dialog ref={dialog} className="coordinate-help" aria-labelledby={titleId}
          onClose={() => {
            setOpen(false)
            trigger.current?.focus({ preventScroll: true })
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close()
          }}>
          <header className="coordinate-help-header">
            <h2 id={titleId}>Sun And Earth Elevation Angles At The Lunar South Pole</h2>
            <button type="button" aria-label="Close coordinate help" onClick={() => dialog.current?.close()}>×</button>
          </header>
          <article className="coordinate-help-body" tabIndex={0} aria-label="Coordinate guide">
            <p className="coordinate-help-step">
              Each click moves this site by {step}°. Up increases latitude and down decreases it.
              Right increases longitude and left decreases it. The graph updates for the new location.
            </p>
            <p>The apparent positions of the Sun and Earth relative to the local ridgeline depend on three parameters: <strong>latitude, longitude and time.</strong></p>

            <section>
              <h3>1. Solar Elevation Angle — α<sub>Sun</sub></h3>
              <h4>Latitude</h4>
              <p>The Moon's rotation axis is tilted by approximately <strong>1.54°</strong> relative to the normal to the ecliptic plane.</p>
              <p>As a result, the <strong>solar declination</strong> (<strong>δ<sub>Sun</sub></strong>) — the lunar latitude at which the Sun is directly overhead — varies between <strong>−1.54° and +1.54°</strong> throughout the year.</p>
              <p>At the exact south pole, the solar elevation is almost constant over a single lunar day. As we move away from the pole, the solar trajectory becomes increasingly sinusoidal.</p>
              <p className="coordinate-help-equation">α<sub>Sun</sub>(A) ≈ (90° − |φ|) cos(A) − δ<sub>Sun</sub></p>
              <p>where φ is the observer's latitude, A is the azimuth and δ<sub>Sun</sub> is the solar declination.</p>
              <p>Farther from the pole, the amplitude increases. The seasonal band remains approximately <strong>3.08°</strong> wide.</p>
              <h4>Time</h4>
              <p>The Sun completes a full <strong>360° azimuth cycle every 29.53 Earth days</strong>. However, the elevation curve shifts vertically throughout the year as the solar declination changes.</p>
              <ul>
                <li>toward <strong>southern summer</strong> → the curve shifts <strong>up</strong></li>
                <li>toward <strong>southern winter</strong> → the curve shifts <strong>down</strong></li>
              </ul>
              <p>The ridgeline does not change with time for a given observer location.</p>
              <h4>Longitude</h4>
              <p>Moving east in longitude shifts the instantaneous solar position westward in local azimuth, and vice versa. Moving physically also changes the observed ridgeline.</p>
              <Diagram file="solar_graph.svg" height={330} alt="Solar elevation across azimuth, with the seasonal limits above and below the current curve and the local ridgeline for comparison." />
            </section>

            <section>
              <h3>2. Earth Elevation Angle — α<sub>Earth</sub></h3>
              <h4>Latitude</h4>
              <p>Unlike the Sun, Earth's vertical oscillation is mainly determined by two inclination angles:</p>
              <ul>
                <li><strong>1.54°</strong> — the tilt of the Moon's rotation axis relative to the normal to the ecliptic plane.</li>
                <li><strong>5.14°</strong> — the inclination of the Moon's orbit around Earth relative to the ecliptic plane.</li>
              </ul>
              <p>Because these two inclinations are oriented in opposite directions, they add together relative to the lunar orbital plane:</p>
              <p className="coordinate-help-equation">5.14° + 1.54° = 6.68°</p>
              <p>This gives an approximate vertical libration amplitude of <strong>±6.68°</strong>.</p>
              <p className="coordinate-help-equation">α<sub>Earth</sub> ≈ (90° − |φ|) cos(λ) ± 6.68°</p>
              <p>where λ is the observer longitude.</p>
              <h4>Longitude</h4>
              <p>Because the Moon is tidally locked to Earth, Earth's <strong>mean azimuth</strong> near the south pole is approximately:</p>
              <p className="coordinate-help-equation">A<sub>Earth</sub> ≈ −λ</p>
              <p>The <strong>mean elevation</strong> also depends on longitude through the cosine term:</p>
              <p className="coordinate-help-equation">(90° − |φ|) cos(λ)</p>
              <p>This is <strong>not linear</strong> with longitude. For example, at λ = 45°, the scale factor is <strong>cos 45° ≈ 0.707</strong>, not 0.5.</p>
              <ul>
                <li>at <strong>0° longitude</strong>, the cosine term is maximum</li>
                <li>at <strong>±90°</strong>, it is zero</li>
                <li>at <strong>180°</strong>, it changes sign</li>
              </ul>
              <p>Moving east in longitude shifts Earth's libration trajectory westward, and vice versa.</p>
              <Diagram file="earth_geometry.svg" height={360} alt="Earth–Moon geometry showing the 5.14° orbital inclination and 1.54° axial tilt that together give a 6.68° vertical envelope." />
              <Diagram file="longitude_graph.svg" height={330} alt="Mean Earth elevation follows a cosine with longitude, peaking at 0°, crossing zero at ±90°, and reaching its minimum at 180°." />
              <h4>Time</h4>
              <p>Earth does not travel around the entire horizon like the Sun. Instead, it oscillates around its mean position due to lunar libration.</p>
              <table aria-label="Libration amplitudes and periods">
                <thead><tr><th scope="col">Libration</th><th scope="col">Amplitude</th><th scope="col">Period</th></tr></thead>
                <tbody>
                  <tr><td>Vertical (elevation)</td><td>±6.68°</td><td>27.21 days</td></tr>
                  <tr><td>Horizontal (azimuth)</td><td>~±7.9°</td><td>27.55 days</td></tr>
                </tbody>
              </table>
              <p>There is no comparable annual seasonal displacement as with the Sun, although the shape of the libration trajectory gradually changes.</p>
            </section>

            <section>
              <h3>3. Combined Visualization</h3>
              <table aria-label="Effects of latitude, longitude and time">
                <thead><tr><th scope="col">Input</th><th scope="col">Sun</th><th scope="col">Earth</th><th scope="col">Ridgeline</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Latitude</th><td>Changes amplitude</td><td>Changes elevation</td><td>Changes</td></tr>
                  <tr><th scope="row">Longitude</th><td>Shifts azimuth</td><td>Shifts azimuth and mean elevation</td><td>Changes</td></tr>
                  <tr><th scope="row">Time</th><td>29.53-day cycle + seasons</td><td>~27.3-day libration</td><td>Fixed</td></tr>
                </tbody>
              </table>
              <p>The objective is to identify locations that maximize both <strong>solar illumination</strong> and <strong>direct-to-Earth communication</strong> by comparing the celestial trajectories with the local terrain horizon.</p>
            </section>
            <p className="coordinate-help-note"><em>The illustrations are schematic. The equations are near-pole approximations; precise positions and visibility are calculated in the main app using SPICE ephemerides and DEM terrain data.</em></p>
          </article>
        </dialog>, document.body)}
    </>
  )
}
