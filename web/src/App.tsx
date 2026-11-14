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
import { CompareView } from './ui/CompareView'
import { ResizeHandle } from './ui/ResizeHandle'
import { ServerUnavailable } from './ui/ServerUnavailable'
import { TicketCard } from './ui/TicketCard'
import { TicketPanel } from './ui/TicketPanel'
import { panelId } from './ui/ticketStyle'
import { TopBar } from './ui/TopBar'

// Bundled region and stations so the app still works when the server is down.
const FALLBACK_REGION = meta.regions[0] as Region
const FALLBACK_STATIONS = meta.stations as Meta['stations']
const NO_SITES: readonly Site[] = []
/** While dragging, the URL is written at most twice a second (spec §9.2: Safari limits). */
const URL_WRITE_MS = 500

const SIDE_W_KEY = 'moon-watchers.side-width'
const DEFAULT_SIDE_W = 420
const SIDE_MIN_W = 300
const SIDE_MAX_W = 760

function readSideWidth(): number {
  try {
    const v = Number(localStorage.getItem(SIDE_W_KEY))
    return Number.isFinite(v) && v >= SIDE_MIN_W && v <= SIDE_MAX_W ? v : DEFAULT_SIDE_W
  } catch {
    return DEFAULT_SIDE_W
  }
}

function writeUrl(search: string, mode: 'push' | 'replace') {
  const url = `${window.location.pathname}${search}`
  if (mode === 'push') window.history.pushState({}, '', url)
  else window.history.replaceState({}, '', url)
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
  const presets = presetsFrom(stations)
  const screen = parseScreen2(search)
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
    if (from !== null) writeUrl(from, 'replace')
    writeUrl(serializeScoreSettings(next, window.location.search), 'push')
    setSearch(window.location.search)
  }, [])

  // One panel can be expanded to full size; this is a view choice, not part of the link.
  const [expanded, setExpanded] = useState<number | null>(null)

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
  const [sideWidth, setSideWidth] = useState(readSideWidth)
  const resizeSide = useCallback((w: number | undefined) => {
    const next = w ?? DEFAULT_SIDE_W
    setSideWidth(next)
    try {
      localStorage.setItem(SIDE_W_KEY, String(next))
    } catch {
      // Storage may be blocked; the width then lasts for this visit only.
    }
  }, [])
  const sideMax = Math.max(SIDE_MIN_W, Math.min(SIDE_MAX_W, window.innerWidth - 320))
  const shownIndexes = screen.tickets.flatMap((t, i) => (t.shown ? [i] : []))
  const visibleIndexes = expanded !== null && shownIndexes.includes(expanded) ? [expanded] : shownIndexes

  /** Opens a ticket in the side panel and brings its panel into view. */
  const focusTicket = useCallback(
    (i: number) => {
      apply((s) => ({ ...s, open: i }))
      requestAnimationFrame(() =>
        document.getElementById(panelId(i))?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      )
    },
    [apply],
  )

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
  const stacked = visibleIndexes.length > 1

  return (
    <div className="app" style={{ '--side-w': `${Math.min(sideWidth, sideMax)}px` } as CSSProperties}>
      <TopBar
        sample={showBanner}
        scoreSpec={metaQuery.data?.score}
        settings={settings}
        onSettingsChange={onSettingsChange}
        onSettingsCommit={onSettingsCommit}
      />

      <main className="main" aria-label="South pole">
        {screen.compare ? (
          <CompareView
            tickets={screen.tickets}
            sitesById={sitesById}
            config={config}
            search={search}
            settings={settings}
            isSample={missionIsSample}
            onClose={() => apply((s) => ({ ...s, compare: false }))}
            onOpenTicket={(i) => apply((s) => ({ ...s, compare: false, open: i }))}
          />
        ) : visibleIndexes.length === 0 ? (
          <div className="panels-empty">
            <p>No tickets are shown here.</p>
            <button type="button" className="secondary" onClick={() => apply((s) => showAll(s, true))}>
              Show all tickets
            </button>
          </div>
        ) : (
          <div className={visibleIndexes.length > 2 ? 'panels panels-many' : 'panels'}>
            {visibleIndexes.map((i) => {
              const t = screen.tickets[i]
              return (
                <TicketPanel
                  key={i}
                  index={i}
                  ticket={t}
                  site={siteOf(t)}
                  sites={allSites}
                  region={region}
                  config={config}
                  search={search}
                  tau={tau}
                  stationLabel={stationLabel(t.station, presets)}
                  best={ranking.byIndex.get(i)?.best ?? false}
                  stacked={stacked}
                  expanded={expanded === i}
                  canExpand={shownIndexes.length > 1}
                  onSelectSite={(id) => apply((s) => ({ ...updateTicket(s, i, { site: id }), open: i }))}
                  onView={(view) => changeTicket(i, { view })}
                  onFocus={() => apply((s) => ({ ...s, open: i }))}
                  onExpand={() => setExpanded((e) => (e === i ? null : i))}
                  height={panelHeights[i]}
                  onResize={(h) => resizePanel(i, h)}
                  onOpenAreas={(points) => {
                    setExpanded(null)
                    apply((s) => addTicketsFor(s, i, points))
                  }}
                />
              )
            })}
          </div>
        )}
      </main>

      <ResizeHandle
        orientation="vertical"
        label="Resize the ticket column"
        value={Math.min(sideWidth, sideMax)}
        min={SIDE_MIN_W}
        max={sideMax}
        direction={-1}
        onResize={resizeSide}
        onReset={() => resizeSide(undefined)}
        className="side-resize"
      />

      <aside className="side" aria-label="Mission tickets">
        {sitesQuery.isError ? (
          <ServerUnavailable onRetry={() => void sitesQuery.refetch()} />
        ) : (
          <>
            <div className="tickets-toolbar">
              <span className="muted">
                {screen.tickets.length} {screen.tickets.length === 1 ? 'ticket' : 'tickets'} · {shownIndexes.length} shown
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
                  title="Reorder the tickets from best to worst"
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
            <div className="tickets">
              {screen.tickets.map((t, i) => (
                <TicketCard
                  key={i}
                  index={i}
                  ticket={t}
                  sites={sites}
                  site={siteOf(t)}
                  stations={stations}
                  rank={ranking.byIndex.get(i)}
                  rankedCount={ranking.byIndex.size}
                  open={i === screen.open}
                  isSample={sitesAreSample || missionIsSample}
                  canDelete={screen.tickets.length > 1 || t.site !== null}
                  config={config}
                  search={search}
                  settings={settings}
                  tau={tau}
                  sliderMaxTau={sliderMax}
                  onToggle={() => focusTicket(i)}
                  onDelete={() => {
                    setExpanded(null)
                    setPanelHeights({})
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
                  requestAnimationFrame(() =>
                    document.querySelector('.tickets .ticket:last-child')?.scrollIntoView({ block: 'nearest' }),
                  )
                }}
                title="Open a new mission ticket"
              >
                + New ticket
              </button>
              {screen.tickets.length > 1 && (
                <button
                  type="button"
                  className="primary compare-button"
                  onClick={() => apply((s) => ({ ...s, compare: true }))}
                  disabled={comparable < 2 || screen.compare}
                  title={comparable < 2 ? 'Show at least two tickets that have a site' : 'Compare the shown tickets side by side'}
                >
                  Compare tickets
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
