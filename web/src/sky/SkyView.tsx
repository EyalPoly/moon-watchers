import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
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
  /** Current positions can come from a month outside the plotted mission. */
  observationSeries?: Series | null
  controls?: ReactNode
  /** Mission window and the time being viewed, in ms. */
  startMs: number
  endMs: number
  nowMs: number
  /** The Earth station the contact points are for, e.g. "Madrid (Spain)". */
  stationLabel?: string
}

const INITIAL_SIZE = { width: 420, height: 244 }
const LEFT = 47
const RIGHT = 10
const MAX_PATH_POINTS = 1200
const SUN_RADIUS_DEG = 0.267
const EARTH_RADIUS_DEG = 0.95
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
/** About one contact point per 2 hours, but never more than this many. */
const MAX_CONTACT_POINTS = 480

type ContactKind = 'contact' | 'blocked' | 'no-station' | 'unknown'

const wrap = (az: number) => ((az % 360) + 360) % 360

/** The silhouette as an outline and a fill, with a gap wherever the terrain is unknown. */
function skylineOf(h: Horizon, leftAz: number, y: (el: number) => number, plotWidth: number, bottom: number) {
  const n = h.elevation_deg.length
  type Point = { px: number; py: number }
  const runs: Point[][] = []
  const unknown: { x0: number; x1: number }[] = []
  let known: Point[] | null = null
  let gap: { x0: number; x1: number } | null = null
  for (let k = 0; k <= n; k++) {
    const az = leftAz + (k * 360) / n
    const el = h.elevation_deg[Math.round(wrap(az) / h.az_step_deg) % n]
    // Sample a full turn including the repeated south bearing at the right edge.
    const px = LEFT + (k / n) * plotWidth
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
    unknown: unknown.map((u) => ({ x0: u.x0, width: Math.max(u.x1 - u.x0 + plotWidth / n, 1) })),
  }
}

const known = (values: readonly (number | null)[]) => values.filter((v): v is number => v !== null)

export function SkyView({ horizon, antennaHorizon, series, observationSeries = series, controls, startMs, endMs, nowMs, stationLabel = 'the Earth station' }: SkyViewProps) {
  const svg = useRef<SVGSVGElement>(null)
  const [{ width, height }, setSize] = useState(INITIAL_SIZE)
  useEffect(() => {
    if (!svg.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ width, height })
    })
    observer.observe(svg.current)
    return () => observer.disconnect()
  }, [])
  // Work in CSS pixels, so the plot fills its flex item and text and disks keep their proportions.
  const plotWidth = Math.max(1, width - LEFT - RIGHT)
  const plotTop = Math.min(12, height * 0.06)
  const axisLine = Math.min(14, Math.max(10, height / 12))
  const plotBottom = Math.max(plotTop + 1, height - (3 * axisLine + 4))
  const plotHeight = plotBottom - plotTop
  const [hoverAz, setHoverAz] = useState<number | null>(null)
  // React's ids may contain characters that break url(#…) references.
  const uid = `sky${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const range = useMemo(() => {
    if (!series) return null
    const i0 = Math.max(0, indexAt(series, startMs) ?? 0)
    const i1 = Math.min(series.n - 1, indexAt(series, endMs) ?? series.n - 1)
    return { i0, i1 }
  }, [series, startMs, endMs])

  // South is the seam at both edges. North stays at the centre of every site's plot.
  const leftAz = 180

  const [missionMin, missionMax] = useMemo(() => {
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

  const now = observationSeries ? indexAt(observationSeries, nowMs) : null
  const sunEl = observationSeries && now !== null ? observationSeries.sun_el[now] : null
  const earthEl = observationSeries && now !== null ? observationSeries.earth_el[now] : null
  const elMin = Math.min(missionMin, Math.floor(Math.min(sunEl ?? 0, earthEl ?? 0) - 0.5))
  const elMax = Math.max(missionMax, Math.ceil(Math.max(sunEl ?? 0, earthEl ?? 0) + 1))

  const { x, y, pxPerDeg } = useMemo(
    () => ({
      x: (az: number) => LEFT + (wrap(az - leftAz) / 360) * plotWidth,
      y: (el: number) => plotTop + ((elMax - el) / (elMax - elMin)) * plotHeight,
      pxPerDeg: plotHeight / (elMax - elMin),
    }),
    [leftAz, elMin, elMax, plotTop, plotHeight, plotWidth],
  )

  const terrain = useMemo(() => skylineOf(horizon, leftAz, y, plotWidth, plotBottom), [horizon, leftAz, y, plotWidth, plotBottom])
  // Only drawn when the antenna sits at another height, where its skyline differs.
  const antennaTerrain = useMemo(
    () =>
      antennaHorizon && antennaHorizon.mast_m !== horizon.mast_m ? skylineOf(antennaHorizon, leftAz, y, plotWidth, plotBottom) : null,
    [antennaHorizon, horizon.mast_m, leftAz, y, plotWidth, plotBottom],
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
        const jump = prevX !== null && Math.abs(px - prevX) > plotWidth / 2
        d += `${prevX === null || jump ? 'M' : 'L'}${px.toFixed(1)},${y(el[i]).toFixed(1)}`
        prevX = px
      }
      return d
    }
    const ticks: { body: 'sun' | 'earth'; day: number; x: number; y: number; below?: boolean }[] = []
    const days = Math.floor((endMs - startMs) / DAY_MS)
    const every = days > 60 ? 10 : days > 20 ? 5 : 1
    for (let d = every; d <= days; d += every) {
      const i = indexAt(series, startMs + d * DAY_MS)
      if (i === null) continue
      ticks.push({ body: 'sun', day: d, x: x(series.sun_az[i]), y: y(series.sun_el[i]) })
      const ridge = horizon.elevation_deg[Math.round(wrap(series.earth_az[i]) / horizon.az_step_deg) % horizon.elevation_deg.length]
      ticks.push({ body: 'earth', day: d, x: x(series.earth_az[i]), y: y(series.earth_el[i]),
        below: ridge !== null && series.earth_el[i] < ridge })
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
  }, [series, range, horizon, x, y, plotWidth, startMs, endMs])

  const landing = series && range ? range.i0 : null

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const matrix = e.currentTarget.getScreenCTM()
    if (!matrix) return
    const { x: px } = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
    if (px < LEFT || px > LEFT + plotWidth) return setHoverAz(null)
    setHoverAz(wrap(leftAz + ((px - LEFT) / plotWidth) * 360))
  }

  const gridEls: number[] = []
  const tickSpacing = (elMax - elMin) / Math.max(2, Math.floor(plotHeight / 20))
  const step = [1, 2, 5, 10, 15, 30, 45].find((value) => value >= tickSpacing) ?? 90
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

  // The tracking line follows the Sun during playback. Pointing at the graph inspects the ridge instead.
  const trackingAz = hoverAz ?? (observationSeries && now !== null ? observationSeries.sun_az[now] : null)
  const trackingEl = hoverAz !== null ? hoverEl : sunEl
  const trackingText = `${hoverAz === null ? 'Sun' : 'Ridge'} ${trackingEl == null ? 'unknown' : `${trackingEl.toFixed(1)}°`}`

  return (
    <figure className="sky-view">
      <svg
        ref={svg}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={skyDescription(observationSeries, now)}
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
          <clipPath id={`${uid}-below`}><path d={terrain.area} /></clipPath>
          {antennaTerrain && <clipPath id={`${uid}-below-antenna`}><path d={antennaTerrain.area} /></clipPath>}
          <clipPath id={`${uid}-globe`}><circle r="1" /></clipPath>
          <radialGradient id={`${uid}-ocean`} cx="35%" cy="30%" r="80%">
            <stop stopColor="#96e5ff" /><stop offset=".48" stopColor="#378bca" /><stop offset="1" stopColor="#10315e" />
          </radialGradient>
          <clipPath id={`${uid}-plot`}>
            <rect x={LEFT} y={plotTop} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>

        <rect x={LEFT} y={plotTop} width={plotWidth} height={plotHeight} fill={`url(#${uid}-bg)`} />

        <text x={LEFT + plotWidth / 2} y={height - 2} className="sky-axis-title" textAnchor="middle">Azimuth (° from north)</text>
        <text transform={`translate(12 ${plotTop + plotHeight / 2}) rotate(-90)`} className="sky-axis-title" textAnchor="middle">Elevation (°)</text>

        {gridEls.map((el) => (
          <g key={el}>
            <line
              x1={LEFT}
              x2={LEFT + plotWidth}
              y1={y(el)}
              y2={y(el)}
              className={el === 0 ? 'sky-grid sky-grid-zero' : 'sky-grid'}
            />
            <text x={LEFT - 4} y={y(el) + 3} className="sky-label" textAnchor="end">
              {el}°
            </text>
          </g>
        ))}
        {Array.from({ length: 24 }, (_, k) => k * 15).map((az) => (
          <line
            key={`minor-${az}`}
            x1={x(az)}
            x2={x(az)}
            y1={plotBottom}
            y2={plotBottom + (az % 45 === 0 ? 5 : 3)}
            className="sky-axis-tick"
          />
        ))}
        {Array.from({ length: 9 }, (_, k) => {
          const az = wrap(leftAz + k * 45)
          const label = COMPASS[az / 45]
          // Pin the repeated south bearing to the right edge.
          const px = k === COMPASS.length ? LEFT + plotWidth : x(az)
          const anchor = k === 0 ? 'start' : k === COMPASS.length ? 'end' : 'middle'
          return (
            <g key={k}>
              <line x1={px} x2={px} y1={plotTop} y2={plotBottom} className={az === 0 ? 'sky-grid sky-north' : 'sky-grid'} />
              <text x={px} y={plotBottom + axisLine + 1} className="sky-label sky-degrees" textAnchor={anchor}>
                {String(az % 360).padStart(3, '0')}°
              </text>
              <text x={px} y={plotBottom + 2 * axisLine + 1} className={az % 90 === 0 ? 'sky-label sky-compass sky-cardinal' : 'sky-label sky-compass'} textAnchor={anchor}>
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
            </>
          )}
          {observationSeries && now !== null && (
            <defs>
              <g id={`${uid}-earth-body`} transform={`translate(${x(observationSeries.earth_az[now])} ${y(observationSeries.earth_el[now])}) scale(${Math.max(5.5, EARTH_RADIUS_DEG * pxPerDeg)})`}>
                <circle r="1" className="sky-disk-earth" style={{ fill: `url(#${uid}-ocean)` }} />
                <g clipPath={`url(#${uid}-globe)`}>
                  <path d="M-.88-.54l.42-.23.27.13-.06.23-.24.14-.05.2-.19-.03-.03-.22-.19-.05z M-.33-.04l.31.07.1.24-.19.35-.13.21-.12-.34z M.08-.48l.23-.19.4.01.3.21-.12.19-.25-.03-.1.14-.27-.06-.07-.17-.15.07z M.15-.12l.33.02.12.19-.24.35-.16-.07-.14-.34z" fill="#83bf79" />
                  <path d="M-.82-.65q.4-.21.71-.08m.37.08q.34-.17.58-.08m-1.15.96q.24.10.49.04" fill="none" stroke="white" strokeOpacity=".77" strokeWidth=".085" />
                </g>
              </g>
              <circle
                id={`${uid}-sun-body`}
                cx={x(observationSeries.sun_az[now])}
                cy={y(observationSeries.sun_el[now])}
                r={Math.max(3.5, SUN_RADIUS_DEG * pxPerDeg)}
                className="sky-disk-sun"
              />
            </defs>
          )}

          <path d={terrain.area} fill={`url(#${uid}-terrain)`} />
          <path d={terrain.line} className="sky-terrain-edge" />
          {antennaTerrain && <path d={antennaTerrain.line} className="sky-terrain-edge-antenna" />}
          {terrain.unknown.map((u) => (
            <rect key={u.x0} x={u.x0} y={plotTop} width={u.width} height={plotHeight} className="sky-unknown-band">
              <title>Terrain unknown here (missing data)</title>
            </rect>
          ))}

          {/* The hidden parts of each path still show, faint and dashed, over the terrain. */}
          {paths && (
            <>
              <path d={paths.earth} clipPath={`url(#${uid}-below)`} className="sky-path sky-path-earth sky-path-hidden" />
              <path d={paths.sun} className="sky-path sky-path-sun sky-path-hidden" />
              {paths.ticks.map((t) => (
                <circle
                  key={`${t.body}-${t.day}`}
                  cx={t.x}
                  cy={t.y}
                  r={t.body === 'earth' ? 1 : 1.8}
                  opacity={t.below ? 0 : 1}
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
          {observationSeries && now !== null && (
            <>
              <use href={`#${uid}-earth-body`} />
              <g clipPath={`url(#${uid}-${antennaTerrain ? 'below-antenna' : 'below'})`} className="sky-obscured-bodies">
                <title>Earth behind terrain</title>
                <use href={`#${uid}-earth-body`} />
              </g>
              <use href={`#${uid}-sun-body`} />
              <g clipPath={`url(#${uid}-below)`} className="sky-obscured-bodies">
                <title>Sun behind terrain</title>
                <use href={`#${uid}-sun-body`} />
              </g>
            </>
          )}
          {trackingAz !== null && (
            <g className="sky-cursor" pointerEvents="none">
              <line x1={x(trackingAz)} x2={x(trackingAz)} y1={plotTop} y2={plotBottom} className="sky-hover" />
              <g transform={`translate(${Math.min(x(trackingAz) + 4, width - RIGHT - 84)} ${Math.max(plotTop, Math.min(plotBottom - 19, trackingEl == null ? plotTop + 2 : y(trackingEl) - 22))})`}>
                <rect width="82" height="17" rx="4" className="sky-bubble" />
                <text x="41" y="12" textAnchor="middle" className="sky-bubble-text">{trackingText}</text>
              </g>
            </g>
          )}
        </g>
      </svg>
      <figcaption className={controls ? 'sky-caption graph-footer' : 'sky-caption'}>
        {controls}
        <details className="sky-key">
        <summary>Graph Key</summary><div className="sky-key-items">
        <span className="legend legend-sun">Sun</span>
        <span className="legend legend-earth">Earth</span>
        <span className="legend-dot legend-obscured">Gray disk: behind terrain</span>
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
        </div></details>
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
