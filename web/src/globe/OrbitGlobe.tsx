import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Directions, MoonOrbit, ProjectLocation, createMoonOrbit } from '../../public/orbit/moon-orbit/moon-orbit'
import type { Site } from '../api/types'

interface Props {
  directions?: Directions
  sites: readonly Site[]
  selected: Site | undefined
  onSelect: (site: Site | null) => void
  scrubbing: boolean
}

const OPENING_VIEW = { longitude: -156, latitude: -23 }
const moduleUrl = `${import.meta.env.BASE_URL}orbit/moon-orbit/moon-orbit.js`

export function OrbitGlobe({ directions, sites, selected, onSelect, scrubbing }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const pins = useRef<HTMLDivElement>(null)
  const viewer = useRef<MoonOrbit | null>(null)
  const project = useRef<ProjectLocation | null>(null)
  const latest = useRef({ directions, selected, scrubbing })
  const [status, setStatus] = useState<'loading' | 'ready' | 'preview' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  function placePins() {
    if (!project.current || !pins.current) return
    for (const pin of Array.from(pins.current.children) as HTMLElement[]) {
      const point = project.current(Number(pin.dataset.lon), Number(pin.dataset.lat))
      pin.hidden = !point.visible
      if (point.visible) {
        pin.style.left = point.x + 'px'
        pin.style.top = point.y + 'px'
      }
    }
  }

  useLayoutEffect(() => {
    latest.current = { directions, selected, scrubbing }
    placePins()
  })
  useLayoutEffect(() => { if (directions) viewer.current?.setDirections(directions) }, [directions])
  useEffect(() => { viewer.current?.setInteracting(scrubbing) }, [scrubbing])
  useEffect(() => {
    if (selected) viewer.current?.setView({ longitude: selected.lon_deg, latitude: selected.lat_deg, zoom: 1.8 })
  }, [selected?.id, selected?.lat_deg, selected?.lon_deg])

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal
    const element = host.current!
    async function mount() {
      try {
        const module: { createMoonOrbit: typeof createMoonOrbit } = await import(/* @vite-ignore */ moduleUrl)
        if (signal.aborted) return
        const initial = latest.current
        const orbit = await module.createMoonOrbit(element, {
          signal, directions: initial.directions, view: OPENING_VIEW,
          onFrame: projection => { project.current = projection; placePins() },
        })
        if (signal.aborted) { orbit.dispose(); return }
        viewer.current = orbit
        if (latest.current.directions) orbit.setDirections(latest.current.directions)
        const focus = latest.current.selected
        if (focus) orbit.setView({ longitude: focus.lon_deg, latitude: focus.lat_deg, zoom: 1.8 })
        orbit.setInteracting(latest.current.scrubbing)
        setStatus('ready')
        const detail = await orbit.ready
        if (!signal.aborted && detail.quality === 'preview') setStatus('preview')
      } catch {
        if (!signal.aborted) setStatus('error')
      }
    }
    void mount()
    return () => { controller.abort(); viewer.current = null; project.current = null }
  }, [attempt])

  const ready = Boolean(directions) && (status === 'ready' || status === 'preview')
  function focusPole() {
    onSelect(null)
    viewer.current?.setView({ longitude: 0, latitude: -90, zoom: 1.5 })
  }
  return <>
    <div className="orbit-world" style={{ visibility: ready ? 'visible' : 'hidden' }}>
      <div ref={host} className="orbit-host" />
      <div ref={pins} className="orbit-pins" aria-label="Lunar landmarks">
        <button type="button" className="orbit-pole" data-lon="0" data-lat="-90" hidden
          onClick={focusPole} title="Center the south pole">South pole</button>
        {sites.map(site => <button type="button" key={site.id} data-lon={site.lon_deg} data-lat={site.lat_deg}
          className="orbit-site-pin" hidden aria-label={site.name} title={site.name} aria-pressed={site.id === selected?.id}
          onClick={() => onSelect(site)} />)}
      </div>
    </div>
    {status === 'error' ? <div className="orbit-notice" role="alert">
      The lunar surface could not load. <button type="button" onClick={() => { setStatus('loading'); setAttempt(n => n + 1) }}>Retry globe</button>
    </div> : !ready && directions ? <div className="orbit-notice" role="status">Loading lunar terrain…</div> : null}
    {status === 'preview' && <small className="orbit-detail-note">Showing lower-resolution terrain.</small>}
    <div className="orbit-camera" aria-label="Globe controls">
      <button type="button" disabled={!ready} aria-label="Zoom in on the Moon" onClick={() => viewer.current?.zoomBy(1.25)}>+</button>
      <button type="button" disabled={!ready} aria-label="Zoom out from the Moon" onClick={() => viewer.current?.zoomBy(0.8)}>−</button>
      <button type="button" disabled={!ready} aria-label="Reset orbital view" title="Reset view" onClick={() => { onSelect(null); viewer.current?.setView({ ...OPENING_VIEW, zoom: 1 }) }}>↺</button>
    </div>
  </>
}
