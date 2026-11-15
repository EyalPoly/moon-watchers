import Feature from 'ol/Feature'
import { asArray } from 'ol/color'
import { createApi } from '../api/client'
import { resolveSource, type AppConfig } from '../api/config'
import type { Meta } from '../api/types'
import { cellGrader } from '../state/areaGrade'
import type { Ticket } from '../state/tickets'
import { isCustom, type ScoreSettings } from '../api/scoreSettings'
import { AreaGradeLegend } from '../ui/MapLegend'
import { ScoreSettingsPanel } from '../ui/ScoreSettingsPanel'
import { gradeColor, type AppliedRegion } from './RegionOverlay'
import type MapBrowserEvent from 'ol/MapBrowserEvent'
import { LineString, Point, Polygon } from 'ol/geom'
import { DoubleClickZoom } from 'ol/interaction'
import VectorLayer from 'ol/layer/Vector'
import { transform } from 'ol/proj'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { useEffect, useMemo, useState } from 'react'
import { rankAreas, TooManyCellsError, type RankedArea } from '../api/areas'
import { formatLatLon, pointId, type LatLon } from '../api/points'
import { useMap } from './PolarMap'

export interface AreaToolProps {
  /** Radius of the custom-point area in map meters: grid points stay inside it. */
  areaRadiusM: number
  /** Opens one ticket per chosen area. */
  spec: Meta['score']
  settings: ScoreSettings
  config: AppConfig
  search: string
  /** The card whose mission the areas are graded for. */
  ticket: Ticket
  onSettingsApply: (settings: ScoreSettings) => void
  onOpen: (points: { site: string; name: string }[], region: AppliedRegion) => void
  onClose: () => void
  /** Name prefix for the new tickets, e.g. the source ticket's name. */
  namePrefix: string
}

const SPACINGS_KM = [2, 5, 10]

/** Grid, outline and best areas on one ticket's map (spec §9.3 freehand select, as a grid polygon). */
export function AreaTool({ areaRadiusM, onOpen, onClose, namePrefix, spec, settings, config, search, ticket, onSettingsApply }: AreaToolProps) {
  const map = useMap()
  const [spacingKm, setSpacingKm] = useState(5)
  const [vertices, setVertices] = useState<[number, number][]>([])
  const [areas, setAreas] = useState<RankedArea[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [stats, setStats] = useState<{ cells: number; failed: number; firstFailure: string | null } | null>(null)
  const [outside, setOutside] = useState(false)

  const [draftSettings, setDraftSettings] = useState<ScoreSettings | null>(null)
  const [outline, setOutline] = useState<LatLon[]>([])

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
      if (busy || draftSettings) return
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
  }, [map, spacingKm, areaRadiusM, busy, draftSettings])

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
          fill: new Fill({ color: [...asArray(gradeColor(a.grade)).slice(0, 3), chosen ? 0.58 : 0.32] }),
          stroke: new Stroke({ color: chosen ? '#ffffff' : gradeColor(a.grade), width: chosen ? 2.5 : 1 }),
          text: new Text({ text: `#${a.rank}`, fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color: '#000', width: 3 }), font: 'bold 11px system-ui' }),
        }),
      )
      source.addFeature(f)
    }
  }, [map, layers, areas, selected])

  const findAreas = async () => {
    if (!map || vertices.length < 3 || busy) return
    const projection = map.getView().getProjection()
    const polygon = vertices.map((v) => {
      const [lon, lat] = transform(v, projection, 'EPSG:4326')
      return { lat, lon }
    })
    setOutline(polygon)
    setBusy(true)
    setProblem(null)
    setStats(null)
    setProgress(null)
    try {
      const grade = cellGrader(createApi(config, search), ticket, settings)
      const result = await rankAreas({ polygon, spacingKm, grade, onProgress: (done, total) => setProgress({ done, total }) })
      setAreas(result.areas)
      setStats(result)
      setSelected(new Set(result.areas.slice(0, 1).map((a) => a.id)))
    } catch (error) {
      setAreas(null)
      setProblem(
        error instanceof TooManyCellsError
          ? `This outline has ${error.count} grid cells; the most we can grade at once is ${error.max}. Draw a smaller outline or pick a larger grid.`
          : error instanceof Error ? error.message : String(error),
      )
    } finally {
      setBusy(false)
      setProgress(null)
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

  if (draftSettings) return (
    <form className="area-tool region-settings" role="dialog" aria-label="Grading Weights" onSubmit={(e) => {
      e.preventDefault()
      if (e.currentTarget.querySelector('[aria-invalid="true"], [role="alert"]')) return
      onSettingsApply(draftSettings)
      setDraftSettings(null)
    }}>
      <div className="area-tool-head"><strong>Grading Weights</strong>
        <button type="button" className="link-button" onClick={() => setDraftSettings(null)}>Cancel</button></div>
      <ScoreSettingsPanel spec={spec} value={draftSettings} onChange={setDraftSettings} onCommit={setDraftSettings} />
      <button type="submit" className="primary settings-apply">Apply</button>
    </form>
  )

  return (
    <div className="area-tool" role="dialog" aria-label="Manual Selection">
      <div className="area-tool-head">
        <strong>Manual Selection</strong>
        <button type="button" className="icon-plain" onClick={onClose} aria-label="Close area tool" title="Close">
          ✕
        </button>
      </div>
      <p className="region-instruction" aria-live="polite">
        <strong>Select at least 3 different grid points</strong>
        <span>{vertices.length} selected{vertices.length < 3 ? ` · ${3 - vertices.length} more needed` : ' · outline ready'}</span>
      </p>
      {problem && <p className="field-error" role="alert">{problem}</p>}
      {outside && (
        <p className="field-error" role="status">
          That point is outside the custom-point area (inside the dashed circle, 84°S to the pole).
        </p>
      )}
      <div className="area-row region-drawing-actions">
        <label className="area-row">
          Grid
          <select
            disabled={busy}
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
        <button type="button" className="link-button" onClick={() => { setVertices((v) => v.slice(0, -1)); setAreas(null); setSelected(new Set()) }} disabled={busy || vertices.length === 0}>
          Undo point
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setVertices([])
            setAreas(null)
          }}
          disabled={busy || vertices.length === 0}
        >
          Clear
        </button>
        <button type="button" className="secondary region-score" disabled={busy} onClick={() => setDraftSettings(settings)}>
          {isCustom(settings) ? 'Grading Weights (custom)' : 'Grading Weights'}
        </button>
        {areas?.length ? (
          <button type="button" className="primary area-find" disabled={chosen.length === 0}
            onClick={() => onOpen(chosen.map((a) => ({
              site: pointId(a.center.lat, a.center.lon), name: `${namePrefix} · area #${a.rank}`,
            })), { outline, areas: chosen })}>Apply</button>
        ) : (
          <button type="button" className="primary area-find" onClick={() => void findAreas()} disabled={vertices.length < 3 || busy}>
            {busy ? (progress ? `Grading ${progress.done} of ${progress.total}…` : 'Grading…') : 'Choose On Map'}
          </button>
        )}
      </div>

      {areas && (
        <>
          {areas.length === 0 ? (
            <p className="area-hint">No grid cell fits inside this outline. Try a larger outline or a finer grid.</p>
          ) : (
            <>
              <AreaGradeLegend />
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
            </>
          )}
          {stats && stats.failed > 0 && (
            <p className="area-hint" role="status">{stats.failed} of {stats.cells} cells could not be graded ({stats.firstFailure}).</p>
          )}
          <p className="area-hint">
            {resolveSource(config, 'summary', search) === 'sample'
              ? 'Sample grades (stand-in data), best first.'
              : "Graded by the server for this card's mission, best first."}
          </p>
        </>
      )}
    </div>
  )
}
