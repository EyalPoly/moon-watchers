export interface SunSeason {
  latDeg: number
  /** Lowest and highest Sun declination over the ephemeris, in degrees. */
  minDeg: number
  maxDeg: number
}

const RAD = Math.PI / 180

/** Elevation of the Sun at a compass bearing, along the sky curve of constant declination. */
export function solarCurveDeg(azDeg: number, latDeg: number, decDeg: number): number {
  const p = -Math.sin(latDeg * RAD)
  const q = Math.cos(latDeg * RAD) * Math.cos(azDeg * RAD)
  const z = Math.max(-1, Math.min(1, -Math.sin(decDeg * RAD) / Math.hypot(p, q)))
  return (Math.atan2(q, p) + Math.asin(z)) / RAD
}

/** The sky between the curves of lowest and highest declination, as one closed outline.
 *  `x` receives degrees from `startDeg` and must map 0° to the left edge and 360° to the right edge,
 *  not wrap 360° back to 0°. */
export function seasonOutline(
  season: SunSeason,
  x: (az: number) => number,
  y: (el: number) => number,
  stepDeg = 3,
  startDeg = 0,
): string {
  const azimuths: number[] = []
  for (let az = 0; az <= 360; az += stepDeg) azimuths.push(startDeg + az)
  const trace = (dec: number, order: number[]) =>
    order.map((az) => `${x(az - startDeg).toFixed(1)},${y(solarCurveDeg(az, season.latDeg, dec)).toFixed(1)}`)
  const forward = trace(season.minDeg, azimuths)
  const back = trace(season.maxDeg, [...azimuths].reverse())
  return `M${forward.join('L')}L${back.join('L')}Z`
}
