import Feature from 'ol/Feature'
import type MapBrowserEvent from 'ol/MapBrowserEvent'
import { LineString, Point, Polygon } from 'ol/geom'
import { DoubleClickZoom } from 'ol/interaction'
import VectorLayer from 'ol/layer/Vector'
import { transform } from 'ol/proj'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { useEffect, useMemo, useState } from 'react'
import { rankAreas, type RankedArea } from '../api/areas'
import { formatLatLon, pointId } from '../api/points'
import { useMap } from './PolarMap'

export interface AreaToolProps {
  /** Radius of the custom-point area in map meters: grid points stay inside it. */
  areaRadiusM: number
  /** Opens one ticket per chosen area. */
  onOpen: (points: { site: string; name: string }[]) => void
  onClose: () => void
  /** Name prefix for the new tickets, e.g. the source ticket's name. */
  namePrefix: string
}

const SPACINGS_KM = [2, 5, 10]

const gradeColor = (g: number) => (g >= 70 ? '#4ade80' : g >= 40 ? '#fbbf24' : '#f87171')

/** Grid, outline and best areas on one ticket's map (spec §9.3 freehand select, as a grid polygon). */
export function AreaTool({ areaRadiusM, onOpen, onClose, namePrefix }: AreaToolProps) {
  const map = useMap()
  const [spacingKm, setSpacingKm] = useState(5)
  const [vertices, setVertices] = useState<[number, number][]>([])
  const [areas, setAreas] = useState<RankedArea[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [outside, setOutside] = useState(false)

  const layers = useMemo(
    () => ({
      grid: new VectorLayer({
        source: new VectorSource(),
        style: new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.22)', width: 1 }) }),
      }),
      areas: new VectorLayer({ source: new VectorSource() }),
      draw: new VectorLayer({ source: new VectorSource() }),
    }),
    [],
  )

  // Layers live as long as the tool is open.
  useEffect(() => {
    if (!map) return
    map.addLayer(layers.grid)
    map.addLayer(layers.areas)
    map.addLayer(layers.draw)
    return () => {
      map.removeLayer(layers.grid)
      map.removeLayer(layers.areas)
      map.removeLayer(layers.draw)
    }
  }, [map, layers])

  // Grid lines, clipped to the custom-point area's circle.
  useEffect(() => {
    const source = layers.grid.getSource() as VectorSource
    source.clear()
    const s = spacingKm * 1000
    const r = areaRadiusM
    const features: Feature[] = []
    for (let k = -Math.floor(r / s); k <= Math.floor(r / s); k++) {
      const c = k * s
      const half = Math.sqrt(Math.max(0, r * r - c * c))
      features.push(new Feature(new LineString([[c, -half], [c, half]])))
      features.push(new Feature(new LineString([[-half, c], [half, c]])))
    }
    source.addFeatures(features)
  }, [layers, spacingKm, areaRadiusM])

  // Quick clicks add points, so double-click zoom is off while the tool is open.
  useEffect(() => {
    if (!map) return
    const zooms = map
      .getInteractions()
      .getArray()
      .filter((i) => i instanceof DoubleClickZoom)
    zooms.forEach((i) => i.setActive(false))
    return () => zooms.forEach((i) => i.setActive(true))
  }, [map])

  // Clicks add the nearest grid point to the outline.
  useEffect(() => {
    if (!map) return
    const onClick = (e: MapBrowserEvent<PointerEvent>) => {
      const s = spacingKm * 1000
      const x = Math.round(e.coordinate[0] / s) * s
      const y = Math.round(e.coordinate[1] / s) * s
      if (Math.hypot(x, y) > areaRadiusM) {
        setOutside(true)
        return
      }
      setOutside(false)
      setVertices((v) => (v.some(([vx, vy]) => vx === x && vy === y) ? v : [...v, [x, y]]))
      setAreas(null)
      setSelected(new Set())
    }
    map.on('click', onClick)
    return () => map.un('click', onClick)
  }, [map, spacingKm, areaRadiusM])

  // The outline: its points, and the polygon once there are three.
  useEffect(() => {
    const source = layers.draw.getSource() as VectorSource
    source.clear()
    const lime = '#a3e635'
    if (vertices.length >= 2) {
      const ring = vertices.length >= 3 ? new Polygon([[...vertices, vertices[0]]]) : new LineString(vertices)
      const f = new Feature(ring)
      f.setStyle(
        new Style({
          stroke: new Stroke({ color: lime, width: 2 }),
          fill: new Fill({ color: 'rgba(163,230,53,0.08)' }),
        }),
      )
      source.addFeature(f)
    }
    vertices.forEach((v, i) => {
      const f = new Feature(new Point(v))
      f.setStyle(
        new Style({
          image: new CircleStyle({ radius: 5, fill: new Fill({ color: lime }), stroke: new Stroke({ color: '#111', width: 1.5 }) }),
          text: new Text({ text: String(i + 1), offsetY: -12, fill: new Fill({ color: '#fff' }), font: '11px system-ui' }),
        }),
      )
      source.addFeature(f)
    })
  }, [layers, vertices])

  // The ranked areas, colored by grade and labeled with their rank.
  useEffect(() => {
    const source = layers.areas.getSource() as VectorSource
    source.clear()
    if (!map || !areas) return
    const projection = map.getView().getProjection()
    for (const a of areas) {
      const ring = a.corners.map((c) => transform([c.lon, c.lat], 'EPSG:4326', projection))
      const f = new Feature(new Polygon([[...ring, ring[0]]]))
      const chosen = selected.has(a.id)
      f.setStyle(
        new Style({
          fill: new Fill({ color: `${gradeColor(a.grade)}${chosen ? '88' : '44'}` }),
          stroke: new Stroke({ color: chosen ? '#ffffff' : gradeColor(a.grade), width: chosen ? 2.5 : 1 }),
          text: new Text({ text: `#${a.rank}`, fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color: '#000', width: 3 }), font: 'bold 11px system-ui' }),
        }),
      )
      source.addFeature(f)
    }
  }, [map, layers, areas, selected])

  const findAreas = async () => {
    if (!map || vertices.length < 3) return
    const projection = map.getView().getProjection()
    const polygon = vertices.map((v) => {
      const [lon, lat] = transform(v, projection, 'EPSG:4326')
      return { lat, lon }
    })
    setBusy(true)
    try {
      const ranked = await rankAreas({ polygon, spacingKm })
      setAreas(ranked)
      setSelected(new Set(ranked.slice(0, 1).map((a) => a.id)))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const chosen = (areas ?? []).filter((a) => selected.has(a.id))

  return (
    <div className="area-tool" role="dialog" aria-label="Select region">
      <div className="area-tool-head">
        <strong>Select region</strong>
        <button type="button" className="icon-plain" onClick={onClose} aria-label="Close area tool" title="Close">
          ✕
        </button>
      </div>
      <label className="area-row">
        Grid
        <select
          value={spacingKm}
          onChange={(e) => {
            setSpacingKm(Number(e.target.value))
            setVertices([])
            setAreas(null)
          }}
          aria-label="Grid spacing"
        >
          {SPACINGS_KM.map((km) => (
            <option key={km} value={km}>
              {km} km
            </option>
          ))}
        </select>
      </label>
      <p className="area-hint">
        Click grid points to outline the area ({vertices.length} {vertices.length === 1 ? 'point' : 'points'}).
      </p>
      {outside && (
        <p className="field-error" role="status">
          That point is outside the custom-point area (inside the dashed circle, 84°S to the pole).
        </p>
      )}
      <div className="area-row">
        <button type="button" className="link-button" onClick={() => setVertices((v) => v.slice(0, -1))} disabled={vertices.length === 0}>
          Undo point
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setVertices([])
            setAreas(null)
          }}
          disabled={vertices.length === 0}
        >
          Clear
        </button>
        <button type="button" className="primary area-find" onClick={() => void findAreas()} disabled={vertices.length < 3 || busy}>
          {busy ? 'Finding…' : 'Find best areas'}
        </button>
      </div>

      {areas && (
        <>
          {areas.length === 0 ? (
            <p className="area-hint">No grid cell fits inside this outline. Try a larger outline or a finer grid.</p>
          ) : (
            <ol className="area-list" aria-label="Best areas">
              {areas.map((a) => (
                <li key={a.id}>
                  <label>
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                    <span className="area-rank">#{a.rank}</span>
                    <span className="num" style={{ color: gradeColor(a.grade) }}>
                      {a.grade.toFixed(0)}
                    </span>
                    <span className="num muted">{formatLatLon(a.center.lat, a.center.lon)}</span>
                  </label>
                </li>
              ))}
            </ol>
          )}
          <button
            type="button"
            className="primary area-open"
            disabled={chosen.length === 0}
            onClick={() =>
              onOpen(
                chosen.map((a) => ({
                  site: pointId(a.center.lat, a.center.lon),
                  name: `${namePrefix} · area #${a.rank}`,
                })),
              )
            }
          >
            Open {chosen.length} {chosen.length === 1 ? 'site' : 'sites'}
          </button>
          <p className="area-hint">Sample grades from a stand-in function, best first.</p>
        </>
      )}
    </div>
  )
}
