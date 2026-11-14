import { useId, useMemo, useState, type PointerEvent } from 'react'
import type { Horizon, Series } from '../api/types'
import { DAY_MS } from '../time'
import { indexAt, seriesTimeAt } from '../state/series'

// Sky view (spec §9.3): azimuth across, elevation up, terrain silhouette from the horizon
// mask, the Sun's and the Earth's paths over the mission with day ticks, and both disks
// at the time being viewed. Points along the Earth's path show when the chosen Earth
// station has direct contact. Where the terrain is unknown the silhouette has a gap, shaded.

export interface SkyViewProps {
  /** The skyline at the panel's height: it decides the Sun. */
  horizon: Horizon
  /** The skyline at the antenna's height; a thinner line is drawn when it differs. */
  antennaHorizon?: Horizon
  series: Series | null
  /** Mission window and the time being viewed, in ms. */
  startMs: number
  endMs: number
  nowMs: number
  /** The Earth station the contact points are for, e.g. "Madrid (Spain)". */
  stationLabel?: string
}

// Close to the card's on-screen width, so labels stay readable without scaling.
const W = 420
const H = 244
const PAD = { left: 28, right: 8, top: 8, bottom: 32 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const MAX_PATH_POINTS = 1200
const SUN_RADIUS_DEG = 0.267
const EARTH_RADIUS_DEG = 0.95
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
/** About one contact point per 2 hours, but never more than this many. */
const MAX_CONTACT_POINTS = 480

type ContactKind = 'contact' | 'blocked' | 'no-station' | 'unknown'

const wrap = (az: number) => ((az % 360) + 360) % 360

/** The silhouette as an outline and a fill, with a gap wherever the terrain is unknown. */
function skylineOf(h: Horizon, leftAz: number, x: (az: number) => number, y: (el: number) => number) {
  const n = h.elevation_deg.length
  const bottom = H - PAD.bottom
  const right = PAD.left + PLOT_W
  type Point = { px: number; py: number }
  const runs: Point[][] = []
  const unknown: { x0: number; x1: number }[] = []
  let known: Point[] | null = null
  let gap: { x0: number; x1: number } | null = null
  for (let k = 0; k <= n; k++) {
    const az = leftAz + (k * 360) / n
    const el = h.elevation_deg[Math.round(wrap(az) / h.az_step_deg) % n]
    // The last point is the left edge's value one turn later; pin it to the right edge.
    const px = k === n ? right : x(az)
    if (el === null) {
      known = null
      if (gap) gap.x1 = px
      else {
        gap = { x0: px, x1: px }
        unknown.push(gap)
      }
    } else {
      gap = null
      if (!known) {
        known = []
        runs.push(known)
      }
      known.push({ px, py: y(el) })
    }
  }
  const fmt = (p: Point) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`
  return {
    line: runs.map((r) => `M${r.map(fmt).join('L')}`).join(''),
    area: runs
      .map((r) => `M${r.map(fmt).join('L')}L${r[r.length - 1].px.toFixed(1)},${bottom}L${r[0].px.toFixed(1)},${bottom}Z`)
      .join(''),
    unknown: unknown.map((u) => ({ x0: u.x0, width: Math.max(u.x1 - u.x0 + PLOT_W / n, 1) })),
  }
}

const known = (values: readonly (number | null)[]) => values.filter((v): v is number => v !== null)

/** Circular mean of azimuths, so the view can be centered on where the Earth sits. */
function meanAzimuth(values: number[]): number {
  let x = 0
  let y = 0
  for (const v of values) {
    x += Math.cos((v * Math.PI) / 180)
    y += Math.sin((v * Math.PI) / 180)
  }
  return wrap((Math.atan2(y, x) * 180) / Math.PI)
}

export function SkyView({ horizon, antennaHorizon, series, startMs, endMs, nowMs, stationLabel = 'the Earth station' }: SkyViewProps) {
  const [hoverAz, setHoverAz] = useState<number | null>(null)
  // React's ids may contain characters that break url(#…) references.
  const uid = `sky${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const range = useMemo(() => {
    if (!series) return null
    const i0 = Math.max(0, indexAt(series, startMs) ?? 0)
    const i1 = Math.min(series.n - 1, indexAt(series, endMs) ?? series.n - 1)
    return { i0, i1 }
  }, [series, startMs, endMs])

  // Center the view on the Earth's mean direction: it barely moves, so its libration loop
  // never splits across the left and right edges.
  const centerAz = useMemo(() => {
    if (!series || !range) return 180
    return Math.round(meanAzimuth(series.earth_az.slice(range.i0, range.i1 + 1)) / 10) * 10
  }, [series, range])
  const leftAz = wrap(centerAz - 180)

  const [elMin, elMax] = useMemo(() => {
    let lo = Math.min(-5, ...known(horizon.elevation_deg), ...known(antennaHorizon?.elevation_deg ?? []))
    let hi = Math.max(10, ...known(horizon.elevation_deg), ...known(antennaHorizon?.elevation_deg ?? []))
    if (series && range) {
      for (let i = range.i0; i <= range.i1; i++) {
        hi = Math.max(hi, series.sun_el[i], series.earth_el[i])
        lo = Math.min(lo, series.sun_el[i], series.earth_el[i])
      }
    }
    return [Math.floor(lo - 0.5), Math.ceil(hi + 1)]
  }, [horizon, antennaHorizon, series, range])

  const { x, y, pxPerDeg } = useMemo(
    () => ({
      x: (az: number) => PAD.left + (wrap(az - leftAz) / 360) * PLOT_W,
      y: (el: number) => PAD.top + ((elMax - el) / (elMax - elMin)) * PLOT_H,
      pxPerDeg: PLOT_H / (elMax - elMin),
    }),
    [leftAz, elMin, elMax],
  )

  const terrain = useMemo(() => skylineOf(horizon, leftAz, x, y), [horizon, leftAz, x, y])
  // Only drawn when the antenna sits at another height, where its skyline differs.
  const antennaTerrain = useMemo(
    () =>
      antennaHorizon && antennaHorizon.mast_m !== horizon.mast_m ? skylineOf(antennaHorizon, leftAz, x, y) : null,
    [antennaHorizon, horizon.mast_m, leftAz, x, y],
  )

  const paths = useMemo(() => {
    if (!series || !range) return null
    const stride = Math.max(1, Math.ceil((range.i1 - range.i0) / MAX_PATH_POINTS))
    const build = (az: number[], el: number[]) => {
      let d = ''
      let prevX: number | null = null
      for (let i = range.i0; i <= range.i1; i += stride) {
        const px = x(az[i])
        // Break the line where it wraps from one edge to the other.
        const jump = prevX !== null && Math.abs(px - prevX) > PLOT_W / 2
        d += `${prevX === null || jump ? 'M' : 'L'}${px.toFixed(1)},${y(el[i]).toFixed(1)}`
        prevX = px
      }
      return d
    }
    const ticks: { body: 'sun' | 'earth'; day: number; x: number; y: number }[] = []
    const days = Math.floor((endMs - startMs) / DAY_MS)
    const every = days > 60 ? 10 : days > 20 ? 5 : 1
    for (let d = every; d <= days; d += every) {
      const i = indexAt(series, startMs + d * DAY_MS)
      if (i === null) continue
      ticks.push({ body: 'sun', day: d, x: x(series.sun_az[i]), y: y(series.sun_el[i]) })
      ticks.push({ body: 'earth', day: d, x: x(series.earth_az[i]), y: y(series.earth_el[i]) })
    }
    // Contact points: contact, blocked by terrain, or no station sees the Moon.
    const contact: { x: number; y: number; kind: ContactKind; i: number }[] = []
    const every2h = Math.max(12, Math.ceil((range.i1 - range.i0) / MAX_CONTACT_POINTS))
    for (let i = range.i0; i <= range.i1; i += every2h) {
      const answer = series.contact[i]
      const kind: ContactKind =
        answer === null ? 'unknown' : answer === 1 ? 'contact' : series.earth_station_up[i] ? 'blocked' : 'no-station'
      contact.push({ x: x(series.earth_az[i]), y: y(series.earth_el[i]), kind, i })
    }
    return {
      sun: build(series.sun_az, series.sun_el),
      earth: build(series.earth_az, series.earth_el),
      ticks,
      contact,
    }
  }, [series, range, x, y, startMs, endMs])

  const now = series ? indexAt(series, nowMs) : null
  const landing = series && range ? range.i0 : null

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    if (px < PAD.left || px > PAD.left + PLOT_W) return setHoverAz(null)
    setHoverAz(wrap(leftAz + ((px - PAD.left) / PLOT_W) * 360))
  }

  const gridEls: number[] = []
  const step = elMax - elMin > 20 ? 5 : 2
  for (let el = Math.ceil(elMin / step) * step; el <= elMax; el += step) gridEls.push(el)

  const hoverIndex = hoverAz === null ? 0 : Math.round(hoverAz / horizon.az_step_deg) % horizon.elevation_deg.length
  const hoverEl = horizon.elevation_deg[hoverIndex]
  const hoverKm = horizon.distance_km[hoverIndex]
  const hoverText =
    hoverAz === null
      ? null
      : hoverEl === null
        ? `Az ${hoverAz.toFixed(1)}° · terrain unknown (missing data)`
        : `Az ${hoverAz.toFixed(1)}° · terrain ${hoverEl.toFixed(2)}°${hoverKm === null ? '' : ` · ${hoverKm.toFixed(1)} km away`}`

  return (
    <figure className="sky-view">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={skyDescription(series, now)}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverAz(null)}
      >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#05070a" />
            <stop offset="1" stopColor="#121821" />
          </linearGradient>
          <linearGradient id={`${uid}-terrain`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3b4250" />
            <stop offset="1" stopColor="#1c2028" />
          </linearGradient>
          <clipPath id={`${uid}-plot`}>
            <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>

        <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill={`url(#${uid}-bg)`} />

        {gridEls.map((el) => (
          <g key={el}>
            <line
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={y(el)}
              y2={y(el)}
              className={el === 0 ? 'sky-grid sky-grid-zero' : 'sky-grid'}
            />
            <text x={PAD.left - 4} y={y(el) + 3} className="sky-label" textAnchor="end">
              {el}°
            </text>
          </g>
        ))}
        {Array.from({ length: 24 }, (_, k) => k * 15).map((az) => (
          <line
            key={`minor-${az}`}
            x1={x(az)}
            x2={x(az)}
            y1={H - PAD.bottom}
            y2={H - PAD.bottom + (az % 45 === 0 ? 5 : 3)}
            className="sky-axis-tick"
          />
        ))}
        {COMPASS.map((label, k) => {
          const az = k * 45
          return (
            <g key={label}>
              <line x1={x(az)} x2={x(az)} y1={PAD.top} y2={H - PAD.bottom} className="sky-grid" />
              <text x={x(az)} y={H - PAD.bottom + 15} className="sky-label sky-degrees" textAnchor="middle">
                {az}°
              </text>
              <text x={x(az)} y={H - 4} className="sky-label sky-compass" textAnchor="middle">
                {label}
              </text>
            </g>
          )
        })}

        <g clipPath={`url(#${uid}-plot)`}>
          {paths && (
            <>
              <path d={paths.earth} className="sky-path sky-path-earth" />
              <path d={paths.sun} className="sky-path sky-path-sun" />
            </>
          )}
          {series && now !== null && (
            <>
              <circle
                cx={x(series.earth_az[now])}
                cy={y(series.earth_el[now])}
                r={Math.max(4, EARTH_RADIUS_DEG * pxPerDeg)}
                className="sky-disk-earth"
              />
              <circle
                cx={x(series.sun_az[now])}
                cy={y(series.sun_el[now])}
                r={Math.max(3.5, SUN_RADIUS_DEG * pxPerDeg)}
                className="sky-disk-sun"
              />
            </>
          )}

          {/* Terrain sits in front of the bodies, so a Sun behind a ridge is cut off. */}
          <path d={terrain.area} fill={`url(#${uid}-terrain)`} />
          <path d={terrain.line} className="sky-terrain-edge" />
          {antennaTerrain && <path d={antennaTerrain.line} className="sky-terrain-edge-antenna" />}
          {terrain.unknown.map((u) => (
            <rect key={u.x0} x={u.x0} y={PAD.top} width={u.width} height={PLOT_H} className="sky-unknown-band">
              <title>Terrain unknown here (missing data)</title>
            </rect>
          ))}

          {/* The hidden parts of each path still show, faint and dashed, over the terrain. */}
          {paths && (
            <>
              <path d={paths.earth} className="sky-path sky-path-earth sky-path-hidden" />
              <path d={paths.sun} className="sky-path sky-path-sun sky-path-hidden" />
              {paths.contact.map((p) => (
                <circle key={`c-${p.i}`} cx={p.x} cy={p.y} r={p.kind === 'contact' ? 2.2 : 1.8} className={`sky-contact sky-contact-${p.kind}`}>
                  <title>
                    {p.kind === 'contact'
                      ? `Contact with ${stationLabel}`
                      : p.kind === 'blocked'
                        ? 'No contact: terrain blocks the Earth'
                        : p.kind === 'unknown'
                          ? 'Unknown: the terrain here is missing'
                          : `No contact: ${stationLabel} cannot see the Moon`}
                  </title>
                </circle>
              ))}
              {paths.ticks.map((t) => (
                <circle
                  key={`${t.body}-${t.day}`}
                  cx={t.x}
                  cy={t.y}
                  r={1.8}
                  className={t.body === 'sun' ? 'sky-tick-sun' : 'sky-tick-earth'}
                >
                  <title>{`${t.body === 'sun' ? 'Sun' : 'Earth'}, day ${t.day}`}</title>
                </circle>
              ))}
            </>
          )}
          {series && landing !== null && (
            <>
              <circle cx={x(series.sun_az[landing])} cy={y(series.sun_el[landing])} r={3} className="sky-landing">
                <title>Sun at landing</title>
              </circle>
              <circle cx={x(series.earth_az[landing])} cy={y(series.earth_el[landing])} r={3} className="sky-landing">
                <title>Earth at landing</title>
              </circle>
            </>
          )}
          {hoverAz !== null && (
            <line x1={x(hoverAz)} x2={x(hoverAz)} y1={PAD.top} y2={H - PAD.bottom} className="sky-hover" />
          )}
        </g>
      </svg>
      <figcaption className="sky-caption">
        <span className="legend legend-sun">Sun</span>
        <span className="legend legend-earth">Earth</span>
        <span className="legend legend-terrain">Terrain at {horizon.mast_m} m (panel)</span>
        {antennaTerrain && antennaHorizon && (
          <span className="legend legend-terrain-antenna">Terrain at {antennaHorizon.mast_m} m (antenna)</span>
        )}
        <span className="legend-dot legend-contact">Contact with {stationLabel}</span>
        <span className="legend-dot legend-blocked">Blocked by terrain</span>
        <span className="legend-dot legend-no-station">Station can't see the Moon</span>
        {paths?.contact.some((p) => p.kind === 'unknown') && (
          <span className="legend-dot legend-unknown">Unknown (missing terrain)</span>
        )}
        <span className="sky-hover-text" aria-live="off">
          {hoverText ?? 'Azimuth: 0° north, 90° east, 180° south, 270° west · hover for terrain height · small dots mark mission days'}
        </span>
      </figcaption>
    </figure>
  )
}

function skyDescription(series: Series | null, now: number | null): string {
  if (!series || now === null) return 'Sky view: terrain horizon around the site'
  const sun = `Sun at azimuth ${series.sun_az[now].toFixed(0)}°, elevation ${series.sun_el[now].toFixed(1)}°`
  const earth = `Earth at azimuth ${series.earth_az[now].toFixed(0)}°, elevation ${series.earth_el[now].toFixed(1)}°`
  return `Sky view at ${new Date(seriesTimeAt(series, now)).toISOString().slice(0, 16)}Z: ${sun}; ${earth}.`
}
