import { Activity, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import meta from '@samples/meta.json'
import { resolveSource, type AppConfig } from './api/config'
import type { Meta, Region, Site } from './api/types'
import { isPointId, parsePointId } from './api/points'
import { parseScoreSettings, serializeScoreSettings, type ScoreSettings } from './api/scoreSettings'
import { useCustomSites, useFetchSummary, useMeta, useSites } from './state/queries'
import { toScenario } from './state/scenario'
import { useTicketRanking } from './state/ranking'
import { presetsFrom, stationLabel } from './api/stations'
import {
  addTicket,
  addTicketsFor,
  MAX_URL_TICKETS,
  comparableCount,
  graphClock,
  maxTau,
  parseScreen2,
  placePoint,
  removeTicket,
  serializeScreen2,
  showAll,
  sortByGrade,
  updateTicket,
  type Screen2State,
  type Ticket,
} from './state/tickets'
import { applyPlan, type Plan } from './assistant/plan'
import { AssistantPanel } from './ui/AssistantPanel'
import { CompareView } from './ui/CompareView'
import { TimelineScreen } from './ui/TimelineScreen'
import { parseScreen, withScreen, type AppScreen } from './state/screen'
import { ResizeHandle } from './ui/ResizeHandle'
import { ServerUnavailable } from './ui/ServerUnavailable'
import { LayersBox, type MapLayer, type PolygonLayer } from './ui/LayersBox'
import type { AppliedRegion } from './map/RegionOverlay'
import { GraphControls } from './ui/GraphControls'
import { PointCard } from './ui/PointCard'
import { TicketGraph } from './ui/TicketPanel'
import { ExplorerControls } from './ui/ExplorerControls'
import { SharedSiteMap } from './ui/SharedSiteMap'
import { formatLatLon } from './api/points'
import type { RankedArea } from './api/areas'
import { displayPresets } from './ui/stationNetworks'
import { pointLetter, siteDisplayName } from './ui/points'
import { panelId, ticketVars } from './ui/ticketStyle'
import { TopBar } from './ui/TopBar'
import { LUNAR_DAY_MS } from './time'
import { exploreSite, orbitUtc } from './globe/navigation'

const OrbitScreen = lazy(() => import('./globe/OrbitScreen').then(module => ({ default: module.OrbitScreen })))

// Bundled region and stations so the app still works when the server is down.
const FALLBACK_REGION = meta.regions[0] as Region
const FALLBACK_REGION_JSON = JSON.stringify(FALLBACK_REGION)
const FALLBACK_STATIONS = meta.stations as Meta['stations']
const FALLBACK_SCORE = meta.score as Meta['score']
const NO_SITES: readonly Site[] = []
/** While dragging, the URL is written at most twice a second (spec §9.2: Safari limits). */
const URL_WRITE_MS = 500

const SIDE_W_KEY = 'moon-watchers.calculator-share'
const DEFAULT_SHARE = 2 / 3
const SIDE_MIN_W = 300
/** A calculator at least this wide shows four site cards per page instead of three. */
const FOUR_CARDS_MIN_W = 1000
const DEFAULT_GRAPH_HEIGHT = 280

function readSideShare(): number {
  try {
    const value = Number(localStorage.getItem(SIDE_W_KEY))
    return value > 0 && value < 1 ? value : DEFAULT_SHARE
  } catch {
    return DEFAULT_SHARE
  }
}

function writeUrl(search: string, mode: 'push' | 'replace') {
  const url = `${window.location.pathname}${search}`
  if (mode === 'push') window.history.pushState({}, '', url)
  else window.history.replaceState({}, '', url)
}

/** "02 POINTS", or "1 SAVED  /  1 DRAFT" while a point has no location yet. */
function pointCount(tickets: readonly Ticket[]): string {
  const drafts = tickets.filter((t) => t.site === null).length
  const saved = tickets.length - drafts
  const pad = (n: number) => String(n).padStart(2, '0')
  return drafts > 0 ? `${saved} SAVED  /  ${drafts} DRAFT` : `${pad(saved)} ${saved === 1 ? 'SITE' : 'SITES'}`
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function App({ config }: { config: AppConfig }) {
  const [search, setSearch] = useState(window.location.search)
  useEffect(() => {
    const onPop = () => setSearch(window.location.search)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const metaQuery = useMeta(config, search)
  const sitesQuery = useSites(config, search)
  const sites = sitesQuery.data?.sites ?? NO_SITES
  const stations = metaQuery.data?.stations ?? FALLBACK_STATIONS
  const presets = displayPresets(presetsFrom(stations))
  const screen = parseScreen2(search)
  const appScreen = parseScreen(search)
  const settings = useMemo(() => parseScoreSettings(search), [search])
  // Custom points (new sites by lat/lon) come from POST /sites/custom, one per point.
  const customIds = [...new Set(screen.tickets.flatMap((t) => (t.site !== null && isPointId(t.site) ? [t.site] : [])))]
  const customQueries = useCustomSites(config, search, customIds)
  const customSites = customQueries.flatMap((q) => (q.data ? [q.data] : []))
  // Rebuilt each render; cheap for a catalog, and the ranking query is keyed by value.
  const allSites = customSites.length === 0 ? sites : [...sites, ...customSites]
  const sitesById = new Map(allSites.map((s) => [s.id, s]))
  // The ranking query is keyed by value, so a fresh tickets array each render is fine.
  const ranking = useTicketRanking(screen.tickets, sitesById)

  /** Applies an action to the state in the URL. push: Back undoes it. replace: a tweak. */
  const apply = useCallback((action: (s: Screen2State) => Screen2State, mode: 'push' | 'replace' = 'push') => {
    const next = action(parseScreen2(window.location.search))
    writeUrl(serializeScreen2(next, window.location.search), mode)
    setSearch(window.location.search)
  }, [])

  const changeTicket = useCallback(
    (i: number, patch: Partial<Ticket>, mode: 'push' | 'replace' = 'push') => apply((s) => updateTicket(s, i, patch), mode),
    [apply],
  )

  // The time being viewed lives in state while dragging or playing, so only the cards
  // re-render; the URL follows at most twice a second and once more on release.
  const [liveTau, setLiveTau] = useState<number | null>(null)
  const lastUrlWrite = useRef(0)
  const onTauInput = useCallback((tau: number) => {
    setLiveTau(tau)
    const now = performance.now()
    if (now - lastUrlWrite.current >= URL_WRITE_MS) {
      lastUrlWrite.current = now
      const current = parseScreen2(window.location.search)
      writeUrl(serializeScreen2({ ...current, tau, graphDay: undefined }, window.location.search), 'replace')
    }
  }, [])
  const onTauCommit = useCallback(
    (tau: number) => {
      apply((s) => ({ ...s, tau, graphDay: undefined }), 'replace')
      setLiveTau(null)
    },
    [apply],
  )

  const onGraphDay = (day: number) => {
    const minutes = day * LUNAR_DAY_MS / 60_000
    setLiveTau(null)
    apply((s) => ({ ...s, graphDay: day, tau: minutes >= 0 && minutes <= maxTau(s.tickets) ? minutes : s.tau }), 'replace')
  }

  const [selectedLayer, setSelectedLayer] = useState<MapLayer>('Relief')
  const [guideOpen, setGuideOpen] = useState(false)
  const [polygonLayer, setPolygonLayer] = useState<PolygonLayer>('None')
  const [appliedRegion, setAppliedRegion] = useState<AppliedRegion | null>(null)
  const applySettings = (next: ScoreSettings) => {
    if (serializeScoreSettings(next) === serializeScoreSettings(settings)) return
    writeUrl(serializeScoreSettings(next, window.location.search), 'push')
    setSearch(window.location.search)
  }

  /** Switching screens adds a history entry, so Back returns. */
  const goTo = useCallback((next: AppScreen) => {
    writeUrl(withScreen(window.location.search, next), 'push')
    setSearch(window.location.search)
  }, [])

  // One panel can be expanded to full size; this is a view choice, not part of the link.
  const [expanded, setExpanded] = useState<number | null>(null)
  // The point whose map has Freehand Select on, if any.
  const [freehand, setFreehand] = useState<number | null>(null)
  // The AI guide opened Manual Selection: the tool finds the best areas and reports them.
  const [guideRegion, setGuideRegion] = useState(false)
  const [regionResult, setRegionResult] = useState<{ id: number; text: string } | null>(null)
  const regionCount = useRef(0)
  const onAreasRanked = useCallback((areas: RankedArea[], spacingKm: number) => {
    const top = areas.slice(0, 5).map((a) => `#${a.rank} ${formatLatLon(a.center.lat, a.center.lon)}, grade ${a.grade.toFixed(0)}`)
    const text = areas.length === 0
      ? 'No grid cell fits inside that outline. Try a larger outline or a finer grid.'
      : `Best areas in your outline (${spacingKm} km grid, best first): ${top.join('; ')}${areas.length > 5 ? `; and ${areas.length - 5} more` : ''}. The best one is ticked: press "Apply" to open it as a site, or tick more first.`
    setRegionResult({ id: ++regionCount.current, text })
  }, [])
  /** Score settings from the AI guide: one history step, so Back undoes it. */
  const setScoreFromGuide = useCallback((next: ScoreSettings) => {
    writeUrl(serializeScoreSettings(next, window.location.search), 'push')
    setSearch(window.location.search)
  }, [])

  // Sizes the user dragged: each panel's height (until the tickets are reordered) and the
  // ticket column's width (remembered in this browser).
  const [panelHeights, setPanelHeights] = useState<Record<number, number>>({})
  const resizePanel = useCallback((i: number, h: number | undefined) => {
    setPanelHeights((all) => {
      const next = { ...all }
      if (h === undefined) delete next[i]
      else next[i] = h
      return next
    })
  }, [])
  const [viewport, setViewport] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [sideShare, setSideShare] = useState(readSideShare)
  const sideMax = Math.max(SIDE_MIN_W, viewport - 265)
  const sideWidth = Math.min(sideMax, Math.max(SIDE_MIN_W, Math.round((viewport - 8) * sideShare)))
  const resizeSide = (w?: number) => {
    const next = w === undefined ? DEFAULT_SHARE : w / Math.max(1, viewport - 8)
    setSideShare(next)
    try { localStorage.setItem(SIDE_W_KEY, String(next)) } catch { /* Optional preference. */ }
  }
  const shownIndexes = screen.tickets.flatMap((t, i) => t.shown ? [i] : [])
  const active = shownIndexes.includes(screen.open) ? screen.open : shownIndexes[0] ?? 0
  const view = screen.tickets[active].view
  const selectView = (view: 'map' | 'graph') => {
    setExpanded(null)
    setFreehand(null)
    apply((s) => ({ ...s, tickets: s.tickets.map((t) => ({ ...t, view })) }))
  }
  const focusTicket = (i: number) => apply((s) => ({ ...updateTicket(s, i, { collapsed: undefined }), open: i }))
  const sitesPerPage = Math.min(sideWidth, sideMax) >= FOUR_CARDS_MIN_W ? 4 : 3
  const page = Math.floor(Math.max(0, screen.open) / sitesPerPage)
  const pageCount = Math.ceil(screen.tickets.length / sitesPerPage)
  const start = page * sitesPerPage
  const visibleGraphs = expanded !== null && shownIndexes.includes(expanded)
    ? [expanded] : shownIndexes.filter((i) => pageCount === 1 || (i >= start && i < start + sitesPerPage))
  const selecting = freehand === active && view === 'map' && !screen.compare
  const openRegion = () => {
    if (selecting) { setFreehand(null); return }
    setGuideRegion(false)
    setExpanded(null)
    if (screen.compare || screen.open !== active || !screen.tickets[active].shown || view !== 'map') {
      apply((s) => ({ ...s, compare: false, open: active, tickets: s.tickets.map((t, i) =>
        ({ ...t, view: 'map', shown: t.shown || i === active })) }))
    }
    setFreehand(active)
  }

  const fetchSummary = useFetchSummary(config, search)
  const [sorting, setSorting] = useState(false)
  const gradedCount = screen.tickets.filter((t) => t.site !== null).length
  /** Orders the cards by their weighted score under the current Grading Weights, best first. */
  const sortCardsByGrade = async () => {
    const scenarioKey = (t: Ticket) => (t.site === null ? null : JSON.stringify(toScenario(t.site, t, t.station, settings)))
    const grades = new Map<string, number>()
    setSorting(true)
    try {
      await Promise.all(screen.tickets.map(async (t) => {
        const key = scenarioKey(t)
        if (t.site === null || key === null || grades.has(key)) return
        try {
          grades.set(key, (await fetchSummary(toScenario(t.site, t, t.station, settings))).score.value)
        } catch { /* A card without a score goes last. */ }
      }))
    } finally {
      setSorting(false)
    }
    setExpanded(null)
    setPanelHeights({})
    setFreehand(null)
    apply((s) => sortByGrade(s, (t) => {
      const key = scenarioKey(t)
      return key === null ? undefined : grades.get(key)
    }))
  }

  /** Manual Selection for the AI guide: on the South pole map, finding areas by itself. */
  const openRegionForGuide = () => {
    if (parseScreen(window.location.search) !== 'south_pole') writeUrl(withScreen(window.location.search, 'south_pole'), 'push')
    setExpanded(null)
    apply((s) => ({ ...s, compare: false, open: active, tickets: s.tickets.map((t, i) =>
      ({ ...t, view: 'map', shown: t.shown || i === active })) }))
    setFreehand(active)
    setGuideRegion(true)
  }

  /** The AI guide's sites: added as one step, so Back undoes them together. */
  const openFromGuide = useCallback((plan: Extract<Plan, { kind: 'open' }>) => {
    setExpanded(null)
    setFreehand(null)
    setPanelHeights({})
    const result = applyPlan(parseScreen2(window.location.search), plan)
    writeUrl(serializeScreen2(result.state, window.location.search), 'push')
    setSearch(window.location.search)
    return Array.from({ length: result.count }, (_, k) => pointLetter(result.first + k))
  }, [])

  // The map never waits on the server: until meta arrives (or if it never does) the
  // bundled region is used.
  const loadedRegion = metaQuery.data?.regions[0]
  // Keep the mounted map and pending map clicks when the server confirms the bundled region.
  const region = useMemo(() => !loadedRegion || JSON.stringify(loadedRegion) === FALLBACK_REGION_JSON
    ? FALLBACK_REGION : loadedRegion, [loadedRegion])
  const sitesAreSample = resolveSource(config, 'sites', search) === 'sample'
  const missionIsSample =
    resolveSource(config, 'horizon', search) === 'sample' || resolveSource(config, 'summary', search) === 'sample'
  const siteOf = (t: Ticket) => (t.site === null ? undefined : sitesById.get(t.site))
  const anySite = screen.tickets.some((t) => siteOf(t) !== undefined)
  // The banner shows while any visible number comes from a sample answer.
  const showBanner = sitesAreSample || (anySite && missionIsSample)
  const tau = liveTau ?? screen.tau
  const sliderMax = maxTau(screen.tickets)
  const comparable = comparableCount(screen.tickets)
  const orbitOpen = appScreen === 'orbit'
  const orbitTime = orbitUtc(search, screen.tickets[active].t0)

  function navigate(next: AppScreen) {
    if (next === appScreen) return
    if (liveTau !== null) onTauCommit(liveTau)
    setGuideOpen(false)
    goTo(next)
  }

  function changeOrbitTime(value: string) {
    const params = new URLSearchParams(window.location.search)
    if (value === orbitTime) return
    params.set('orbitUtc', value)
    writeUrl('?' + params, 'replace')
    setSearch(window.location.search)
  }

  function exploreSouthPole(site: string | null, utc: string) {
    const params = new URLSearchParams(window.location.search)
    params.delete('screen')
    const next = exploreSite(parseScreen2(window.location.search), site, utc)
    setFreehand(null)
    setExpanded(null)
    writeUrl(serializeScreen2(next, params.toString()), 'push')
    setSearch(window.location.search)
  }

  return (
    <div className={orbitOpen ? 'app orbit-app' : 'app'} style={{ '--side-w': `${Math.min(sideWidth, sideMax)}px` } as CSSProperties}>
      <TopBar sample={orbitOpen ? sitesAreSample || sites.some(site => site.is_placeholder) : showBanner} current={appScreen} onScreen={navigate} />
      {orbitOpen && <Suspense fallback={<main aria-label="Orbit" role="status">Loading lunar overview…</main>}>
        <OrbitScreen utc={orbitTime} onUtc={changeOrbitTime} sites={allSites} onExplore={exploreSouthPole} />
      </Suspense>}

      <Activity mode={orbitOpen ? 'hidden' : 'visible'}>
      {appScreen === 'timelines' ? (
        <TimelineScreen
          tickets={screen.tickets}
          sitesById={sitesById}
          config={config}
          search={search}
          settings={settings}
          isSample={missionIsSample}
          tau={tau}
          onTauInput={onTauInput}
          onTauCommit={onTauCommit}
          onBack={() => goTo('south_pole')}
          onOpenTicket={(i) => {
            apply((s) => ({ ...updateTicket(s, i, { collapsed: undefined }), compare: false, open: i }))
            goTo('south_pole')
          }}
        />
      ) : (<>

      <main className="main" aria-label="South pole">
        <header className="col-head">
          <p className="eyebrow mono">02&nbsp;&nbsp;/&nbsp;&nbsp;South Pole</p>
          <h1>South Pole Explorer</h1>
        </header>
        {!screen.compare && <ExplorerControls view={view} selecting={selecting} onView={selectView} onRegion={openRegion}
          scoreSpec={metaQuery.data?.score ?? FALLBACK_SCORE} settings={settings} onSettingsApply={applySettings} />}
        {screen.compare ? (
          <CompareView
            tickets={screen.tickets}
            sitesById={sitesById}
            config={config}
            search={search}
            settings={settings}
            isSample={missionIsSample}
            onClose={() => apply((s) => ({ ...s, compare: false }))}
            onOpenTicket={(i) => apply((s) => ({ ...updateTicket(s, i, { collapsed: undefined }), compare: false, open: i }))}
          />
        ) : shownIndexes.length === 0 ? (
          <div className="panels-empty"><p>No sites are shown in the explorer.</p>
            <button type="button" className="secondary" onClick={() => apply((s) => showAll(s, true))}>Show all sites</button>
          </div>
        ) : view === 'map' ? (
          <>
            <SharedSiteMap tickets={screen.tickets} active={active} sites={allSites} region={region} layer={selectedLayer}
              polygonLayer={polygonLayer} appliedRegion={appliedRegion} config={config} search={search}
              settings={settings} selecting={selecting} atLimit={screen.tickets.length >= MAX_URL_TICKETS && screen.tickets[active]?.site !== null} onFocus={focusTicket}
              onPlace={(site) => apply((s) => placePoint(s, active, site))}
              onRegionClose={() => { setFreehand(null); setGuideRegion(false) }}
              guideRegion={guideRegion} onRanked={onAreasRanked}
              onOpenAreas={(points, outline) => {
                setAppliedRegion(outline)
                setPolygonLayer('Ranked areas')
                setFreehand(null)
                apply((s) => addTicketsFor(s, active, points))
              }} />
            <LayersBox selected={selectedLayer} onSelect={setSelectedLayer} overlay={polygonLayer} onOverlay={setPolygonLayer} />
          </>
        ) : (
          <div className="ridge-panels" data-count={visibleGraphs.length}>
            {visibleGraphs.map((i) => {
              const t = screen.tickets[i]
              const graphHeight = panelHeights[i] ?? DEFAULT_GRAPH_HEIGHT
              const site = siteOf(t)
              const customLocation = t.site ? parsePointId(t.site) : null
              const location = customLocation ?? (site && { lat: site.lat_deg, lon: site.lon_deg })
              const siteFailed = t.site && customLocation && customQueries[customIds.indexOf(t.site)]?.isError
              const clock = graphClock(t, tau, liveTau === null ? screen.graphDay : undefined)
              const controls = location && <GraphControls location={location} clock={clock}
                onMove={(id) => changeTicket(i, { site: id })} onDay={onGraphDay} />
              return (
                <section key={i} id={panelId(i)} className="panel ridge-panel"
                  style={{ ...ticketVars(i), '--graph-size': graphHeight } as CSSProperties} aria-label={`Site ${pointLetter(i)} graph`}>
                  <header className="panel-head">
                    <button type="button" className="panel-title" onClick={() => focusTicket(i)}>
                      <span className="badge">{pointLetter(i)}</span><span className="point-name">{t.name || siteDisplayName(site) || 'New site'}</span>
                    </button>
                    {shownIndexes.length > 1 && <button type="button" className="view-tab icon-tab" aria-pressed={expanded === i}
                      aria-label={expanded === i ? 'Show all graphs' : `Expand graph ${pointLetter(i)}`}
                      onClick={() => setExpanded(expanded === i ? null : i)}>{expanded === i ? '⤡' : '⤢'}</button>}
                  </header>
                  {site ? <TicketGraph config={config} search={search} site={site} ticket={t} nowMs={clock.nowMs}
                    controls={controls} stationLabel={stationLabel(t.station, presets)} />
                    : <><p className="panel-empty">{siteFailed
                      ? 'Horizon data is unavailable for this location.' : location ? 'Loading site…'
                      : `Choose a location for site ${pointLetter(i)} to see its local horizon.`}</p>
                      {controls && <div className="graph-footer">{controls}</div>}</>}
                  {visibleGraphs.length > 1 && <ResizeHandle orientation="horizontal" label={`Resize graph ${pointLetter(i)}`}
                    value={graphHeight} min={140} max={600} onResize={(h) => resizePanel(i, h)}
                    onReset={() => resizePanel(i, undefined)} className="panel-resize" />}
                </section>
              )
            })}
            {visibleGraphs.length === 0 && <p className="panel-empty">Show a site on this page to see its graph.</p>}
          </div>
        )}
      </main>

      <ResizeHandle
        orientation="vertical"
        label="Resize the site calculator"
        value={Math.min(sideWidth, sideMax)}
        min={SIDE_MIN_W}
        max={sideMax}
        direction={-1}
        onResize={resizeSide}
        onReset={() => resizeSide(undefined)}
        className="side-resize"
      />

      <aside className="side" aria-label="Site calculator">
        <header className="col-head">
          <p className="eyebrow mono">Site Planning</p>
          <div className="col-head-row">
            <h1>Site Calculator</h1>
          </div>
        </header>
        {sitesQuery.isError ? (
          <ServerUnavailable onRetry={() => void sitesQuery.refetch()} />
        ) : (
          <>
            <div className="tickets-toolbar">
              <details className="site-visibility">
                <summary>{shownIndexes.length} of {screen.tickets.length} shown in the explorer</summary>
                <div className="visibility-options">
                  {screen.tickets.map((t, i) => <label key={i}>
                    <input type="checkbox" checked={t.shown} aria-label={`Show site ${pointLetter(i)} in the explorer`}
                      onChange={(e) => changeTicket(i, { shown: e.target.checked }, 'push')} />
                    {pointLetter(i)} · {t.name || siteDisplayName(siteOf(t)) || 'New site'}
                  </label>)}
                </div>
              </details>
              {screen.tickets.some((t) => t.site === null) && <span className="col-meta mono">{pointCount(screen.tickets)}</span>}
              <button type="button" className="secondary sort-grade" onClick={() => void sortCardsByGrade()}
                disabled={sorting || gradedCount < 2}
                title={gradedCount < 2 ? 'Add at least two sites that have a location' : 'Reorder the cards from the highest weighted score to the lowest'}>
                {sorting ? 'Sorting…' : 'Sort by grade'}
              </button>
              {ranking.updatedAt > 0 && (
                <span className="ranking-status" aria-live="polite">
                  Ranking updated {formatClock(ranking.updatedAt)}
                  {ranking.isFetching ? ' · refreshing…' : ' · refreshes every 15 s'}
                </span>
              )}
            </div>
            {pageCount > 1 && <nav className="site-pages" aria-label="Site pages">
              <button type="button" className="link-button" disabled={page === 0} onClick={() => { setExpanded(null); focusTicket(start - sitesPerPage) }}>Previous</button>
              <span>Sites {start + 1}–{Math.min(start + sitesPerPage, screen.tickets.length)} of {screen.tickets.length}</span>
              <button type="button" className="link-button" disabled={page + 1 === pageCount} onClick={() => { setExpanded(null); focusTicket(start + sitesPerPage) }}>Next</button>
            </nav>}
            <div className="tickets" data-columns={Math.min(sitesPerPage, screen.tickets.length - start)}>
              {screen.tickets.map((t, i) => i >= start && i < start + sitesPerPage && (
                <PointCard
                  key={i}
                  index={i}
                  ticket={t}
                  catalog={sites}
                  site={siteOf(t)}
                  stations={stations}
                  rank={ranking.byIndex.get(i)}
                  rankedCount={ranking.byIndex.size}
                  open={!t.collapsed}
                  active={i === active}
                  onFocus={() => focusTicket(i)}
                  isSample={sitesAreSample || missionIsSample}
                  canDelete={screen.tickets.length > 1 || t.site !== null}
                  config={config}
                  search={search}
                  settings={settings}
                  tau={tau}
                  sliderMaxTau={sliderMax}
                  onToggle={() => changeTicket(i, { collapsed: t.collapsed ? undefined : true })}
                  onDelete={() => {
                    setExpanded(null)
                    setPanelHeights({})
                    setFreehand(null)
                    apply((s) => removeTicket(s, i))
                  }}
                  onChange={(patch, mode) => changeTicket(i, patch, mode)}
                  onTauInput={onTauInput}
                  onTauCommit={onTauCommit}
                />
              ))}
            </div>
            <div className="side-actions">
              <button
                type="button"
                className="secondary add-ticket"
                onClick={() => {
                  setExpanded(null)
                  apply(addTicket)
                }}
                title="Add a new site to plan"
              >
                + Add site
              </button>
              {screen.tickets.length > 1 && (
                <button
                  type="button"
                  className="compare-button"
                  onClick={() => goTo('timelines')}
                  disabled={comparable < 2 || screen.compare}
                  title={comparable < 2 ? 'Show at least two sites that have a location' : 'Compare the shown sites side by side'}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M1.5 14.5h13M3 11.5h5M3 8h8M3 4.5h10" />
                  </svg>{' '}
                  Compare timelines
                </button>
              )}
            </div>
          </>
        )}
      </aside>

      </>)}

      <AssistantPanel
        open={guideOpen} onOpenChange={setGuideOpen}
        ctx={{ catalog: sites, stations: presets }}
        customIsSample={resolveSource(config, 'custom', search) === 'sample'}
        onOpen={openFromGuide}
        tickets={screen.tickets}
        sitesById={sitesById}
        settings={settings}
        config={config}
        search={search}
        screen={appScreen}
        explorer={view}
        regionToolOpen={selecting}
        activeIndex={active}
        onSetScore={setScoreFromGuide}
        onOpenRegion={openRegionForGuide}
        regionResult={regionResult}
      />
      </Activity>
    </div>
  )
}
