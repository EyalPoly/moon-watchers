import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import meta from '@samples/meta.json'
import { resolveSource, type AppConfig } from './api/config'
import type { Meta, Region, Site } from './api/types'
import { isPointId } from './api/points'
import { parseScoreSettings, serializeScoreSettings, type ScoreSettings } from './api/scoreSettings'
import { useCustomSites, useMeta, useSites } from './state/queries'
import { useTicketRanking } from './state/ranking'
import { presetsFrom, stationLabel } from './api/stations'
import {
  addTicket,
  addTicketsFor,
  comparableCount,
  maxTau,
  parseScreen2,
  removeTicket,
  serializeScreen2,
  showAll,
  sortByRank,
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
import { LayersBox, type MapLayer } from './ui/LayersBox'
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

// Bundled region and stations so the app still works when the server is down.
const FALLBACK_REGION = meta.regions[0] as Region
const FALLBACK_STATIONS = meta.stations as Meta['stations']
const NO_SITES: readonly Site[] = []
/** While dragging, the URL is written at most twice a second (spec §9.2: Safari limits). */
const URL_WRITE_MS = 500

const SIDE_W_KEY = 'moon-watchers.calculator-share'
const DEFAULT_SHARE = 2 / 3
const SIDE_MIN_W = 300
const SITES_PER_PAGE = 3

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
      writeUrl(serializeScreen2({ ...current, tau }, window.location.search), 'replace')
    }
  }, [])
  const onTauCommit = useCallback(
    (tau: number) => {
      apply((s) => ({ ...s, tau }), 'replace')
      setLiveTau(null)
    },
    [apply],
  )

  const [resultView, setResultView] = useState<'live' | 'mission'>('live')
  const [selectedLayer, setSelectedLayer] = useState<MapLayer>('Relief')
  // Dragging a weight replaces the URL; on release the pre-drag URL is restored first so
  // that the one history entry added is the change as a whole.
  const settingsDragFrom = useRef<string | null>(null)
  const lastSettingsWrite = useRef(0)
  const onSettingsChange = useCallback((next: ScoreSettings) => {
    settingsDragFrom.current ??= window.location.search
    const now = performance.now()
    if (now - lastSettingsWrite.current < URL_WRITE_MS) return
    lastSettingsWrite.current = now
    writeUrl(serializeScoreSettings(next, window.location.search), 'replace')
  }, [])
  const onSettingsCommit = useCallback((next: ScoreSettings) => {
    const from = settingsDragFrom.current
    settingsDragFrom.current = null
    if (from !== null) {
      writeUrl(from, 'replace')
      // A drag that ended where it began is not a change.
      if (serializeScoreSettings(parseScoreSettings(from)) === serializeScoreSettings(next)) {
        setSearch(window.location.search)
        return
      }
    }
    writeUrl(serializeScoreSettings(next, window.location.search), 'push')
    setSearch(window.location.search)
  }, [])

  const [guideOpen, setGuideOpen] = useState(false)
  /** Switching screens adds a history entry, so Back returns. */
  const goTo = useCallback((next: AppScreen) => {
    writeUrl(withScreen(window.location.search, next), 'push')
    setSearch(window.location.search)
  }, [])

  // One panel can be expanded to full size; this is a view choice, not part of the link.
  const [expanded, setExpanded] = useState<number | null>(null)
  // The point whose map has Freehand Select on, if any.
  const [freehand, setFreehand] = useState<number | null>(null)
  // The AI guide opened Select region: the tool finds the best areas and reports them.
  const [guideRegion, setGuideRegion] = useState(false)
  const [regionResult, setRegionResult] = useState<{ id: number; text: string } | null>(null)
  const regionCount = useRef(0)
  const onAreasRanked = useCallback((areas: RankedArea[], spacingKm: number) => {
    const top = areas.slice(0, 5).map((a) => `#${a.rank} ${formatLatLon(a.center.lat, a.center.lon)}, grade ${a.grade.toFixed(0)}`)
    const text = areas.length === 0
      ? 'No grid cell fits inside that outline. Try a larger outline or a finer grid.'
      : `Best areas in your outline (${spacingKm} km grid, best first): ${top.join('; ')}${areas.length > 5 ? `; and ${areas.length - 5} more` : ''}. The best one is ticked: press "Open 1 site", or tick more first.`
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
  const page = Math.floor(Math.max(0, screen.open) / SITES_PER_PAGE)
  const pageCount = Math.ceil(screen.tickets.length / SITES_PER_PAGE)
  const start = page * SITES_PER_PAGE
  const visibleGraphs = expanded !== null && shownIndexes.includes(expanded)
    ? [expanded] : shownIndexes.filter((i) => pageCount === 1 || (i >= start && i < start + SITES_PER_PAGE))
  const selecting = freehand === active && view === 'map' && !screen.compare
  const openRegion = () => {
    if (selecting) { setFreehand(null); return }
    setGuideRegion(false)
    setExpanded(null)
    apply((s) => ({ ...s, compare: false, open: active, tickets: s.tickets.map((t, i) =>
      ({ ...t, view: 'map', shown: t.shown || i === active })) }))
    setFreehand(active)
  }

  /** Select region for the AI guide: on the South pole map, finding areas by itself. */
  const openRegionForGuide = () => {
    if (parseScreen(window.location.search) === 'timelines') writeUrl(withScreen(window.location.search, 'south_pole'), 'push')
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
  const region = metaQuery.data?.regions[0] ?? FALLBACK_REGION
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

  return (
    <div className="app" style={{ '--side-w': `${Math.min(sideWidth, sideMax)}px` } as CSSProperties}>
      <TopBar
        sample={showBanner}
        scoreSpec={metaQuery.data?.score}
        settings={settings}
        onSettingsChange={onSettingsChange}
        onSettingsCommit={onSettingsCommit}
        screen={appScreen}
        onScreen={goTo}
      />

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
          <p className="eyebrow mono">02&nbsp;&nbsp;/&nbsp;&nbsp;SOUTH POLE</p>
          <h1>South pole explorer</h1>
        </header>
        {!screen.compare && <ExplorerControls view={view} selecting={selecting} onView={selectView} onRegion={openRegion} />}
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
              selecting={selecting} onFocus={focusTicket}
              onPlace={(site) => apply((s) => ({ ...updateTicket(s, active, { site, editing: true, collapsed: undefined }), open: active }))}
              onRegionClose={() => { setFreehand(null); setGuideRegion(false) }}
              guideRegion={guideRegion} onRanked={onAreasRanked}
              onOpenAreas={(points) => { setFreehand(null); apply((s) => addTicketsFor(s, active, points)) }} />
            <LayersBox selected={selectedLayer} onSelect={setSelectedLayer} />
          </>
        ) : (
          <div className="ridge-panels" data-count={visibleGraphs.length}>
            {visibleGraphs.map((i) => {
              const t = screen.tickets[i]
              const site = siteOf(t)
              return (
                <section key={i} id={panelId(i)} className="panel ridge-panel" style={{
                  ...ticketVars(i), ...(visibleGraphs.length > 1 && panelHeights[i] ? { flexGrow: panelHeights[i] / 200 } : {})
                }} aria-label={`Site ${pointLetter(i)} graph`}>
                  <header className="panel-head">
                    <button type="button" className="panel-title" onClick={() => focusTicket(i)}>
                      <span className="badge">{pointLetter(i)}</span><span className="point-name">{t.name || siteDisplayName(site) || 'New site'}</span>
                    </button>
                    {shownIndexes.length > 1 && <button type="button" className="view-tab icon-tab" aria-pressed={expanded === i}
                      aria-label={expanded === i ? 'Show all graphs' : `Expand graph ${pointLetter(i)}`}
                      onClick={() => setExpanded(expanded === i ? null : i)}>{expanded === i ? '⤡' : '⤢'}</button>}
                  </header>
                  {site ? <TicketGraph config={config} search={search} site={site} ticket={t} tau={tau} stationLabel={stationLabel(t.station, presets)} />
                    : <p className="panel-empty">Choose a location for site {pointLetter(i)} to see its local horizon.</p>}
                  {visibleGraphs.length > 1 && <ResizeHandle orientation="horizontal" label={`Resize graph ${pointLetter(i)}`}
                    value={panelHeights[i] ?? 200} min={140} max={600} onResize={(h) => resizePanel(i, h)}
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
          <p className="eyebrow mono">SITE PLANNING</p>
          <div className="col-head-row">
            <h1>Site calculator</h1>
            <span className="col-meta mono">{pointCount(screen.tickets)}</span>
          </div>
        </header>
        {sitesQuery.isError ? (
          <ServerUnavailable onRetry={() => void sitesQuery.refetch()} />
        ) : (
          <>
            <div className="tickets-toolbar">
              <span className="muted">
                {shownIndexes.length} of {screen.tickets.length} shown in the explorer
              </span>
              <span className="toolbar-actions">
                <button type="button" className="link-button" onClick={() => apply((s) => showAll(s, true))}>
                  Show all
                </button>
                <button type="button" className="link-button" onClick={() => apply((s) => showAll(s, false))}>
                  Hide all
                </button>
                <button
                  type="button"
                  className="link-button"
                  disabled={ranking.byIndex.size < 2}
                  onClick={() => {
                    setExpanded(null)
                    setPanelHeights({})
                    apply((s) => sortByRank(s, (i) => ranking.byIndex.get(i)?.rank))
                  }}
                  title="Reorder the sites from best to worst"
                >
                  Sort by rank
                </button>
              </span>
              {ranking.updatedAt > 0 && (
                <span className="ranking-status" aria-live="polite">
                  Ranking updated {formatClock(ranking.updatedAt)}
                  {ranking.isFetching ? ' · refreshing…' : ' · refreshes every 15 s'}
                </span>
              )}
            </div>
            {screen.tickets.some((t) => t.site !== null && !t.editing) && (
              <div className="result-tabs" role="group" aria-label="Site results view">
                <button type="button" aria-pressed={resultView === 'live'} onClick={() => setResultView('live')}>Live conditions</button>
                <button type="button" aria-pressed={resultView === 'mission'} onClick={() => setResultView('mission')}>Whole mission</button>
              </div>
            )}
            {pageCount > 1 && <nav className="site-pages" aria-label="Site pages">
              <button type="button" className="link-button" disabled={page === 0} onClick={() => { setExpanded(null); focusTicket(start - SITES_PER_PAGE) }}>Previous</button>
              <span>Sites {start + 1}–{Math.min(start + SITES_PER_PAGE, screen.tickets.length)} of {screen.tickets.length}</span>
              <button type="button" className="link-button" disabled={page + 1 === pageCount} onClick={() => { setExpanded(null); focusTicket(start + SITES_PER_PAGE) }}>Next</button>
            </nav>}
            <div className="tickets" data-columns={Math.min(SITES_PER_PAGE, screen.tickets.length - start)}>
              {screen.tickets.map((t, i) => i >= start && i < start + SITES_PER_PAGE && (
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
                  resultView={resultView}
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
              <button
                type="button"
                className="secondary guide-launcher"
                aria-expanded={guideOpen}
                onClick={() => setGuideOpen((v) => !v)}
                title="Describe a site or a mission in your own words"
              >
                <span aria-hidden="true">✦</span> Ask the AI guide
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
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
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
    </div>
  )
}
