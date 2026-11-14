import { useMemo } from 'react'
import type { AppConfig } from '../api/config'
import type { ScoreSettings } from '../api/scoreSettings'
import type { Site, StationPoint } from '../api/types'
import { useMeta, useMissionSeries, useSummary } from '../state/queries'
import { useScenario } from '../state/scenario'
import { indexAt, liveStatus } from '../state/series'
import type { MissionState } from '../state/urlState'
import { parseIsoMinute } from '../time'
import { LivePanel } from './LivePanel'
import { MissionControls } from './MissionControls'
import { ServerUnavailable } from './ServerUnavailable'
import { TimeSlider } from './TimeSlider'
import { MissionMetrics, VerdictChips } from './VerdictChips'
import { WarningsStrip } from './WarningsStrip'

export interface MissionParts {
  config: AppConfig
  search: string
  site: Site
  mission: MissionState
  station: StationPoint
  settings: ScoreSettings
  /** The time being viewed; differs from mission.tau while dragging or playing. */
  tau: number
  /** Slider range: the longest mission among the tickets, so all share one clock. */
  sliderMaxTau: number
  onMissionChange: (next: Partial<MissionState>, mode: 'push' | 'replace') => void
  onTauInput: (tau: number) => void
  onTauCommit: (tau: number) => void
}

export function Pending({ label }: { label: string }) {
  return (
    <div className="pending" role="status">
      <span className="spinner" aria-hidden="true" /> {label}
    </div>
  )
}

/** Verdict chips and score: the ticket's header, also shown when it is collapsed. */
export function MissionVerdict({ config, search, site, mission, station, settings }: Pick<MissionParts, 'config' | 'search' | 'site' | 'mission' | 'station' | 'settings'>) {
  const scenario = useScenario(site.id, mission, station, settings)
  const summary = useSummary(config, search, scenario)
  const meta = useMeta(config, search)
  if (summary.isError) return <ServerUnavailable onRetry={() => void summary.refetch()} />
  if (!summary.data) return <Pending label="Computing verdict…" />
  return (
    <>
      <VerdictChips summary={summary.data} slopeDeg={site.slope_deg} />
      <WarningsStrip warnings={summary.data.warnings} catalog={meta.data?.warning_catalog ?? []} />
    </>
  )
}

/** The open ticket's body: controls, mission time, live status, whole-mission numbers. */
export function MissionBody({
  config,
  search,
  site,
  mission,
  station,
  settings,
  tau,
  sliderMaxTau,
  onMissionChange,
  onTauInput,
  onTauCommit,
}: MissionParts) {
  const scenario = useScenario(site.id, mission, station, settings)
  const series = useMissionSeries(config, search, scenario)
  const summary = useSummary(config, search, scenario)

  const t0Ms = parseIsoMinute(mission.t0) as number
  const ownMaxTau = Math.floor((mission.days * 1440) / 10) * 10
  const nowMs = t0Ms + Math.min(tau, ownMaxTau) * 60_000

  const live = useMemo(() => {
    if (!series.data) return null
    const i = indexAt(series.data, nowMs)
    return i === null ? null : liveStatus(series.data, i)
  }, [series.data, nowMs])

  return (
    <>
      <MissionControls mission={mission} onChange={onMissionChange} />

      <TimeSlider
        tau={Math.min(tau, sliderMaxTau)}
        maxTau={sliderMaxTau}
        landingMs={t0Ms}
        onInput={onTauInput}
        onCommit={onTauCommit}
      />
      {tau > ownMaxTau && <p className="hint">This mission has ended; showing its last moment.</p>}

      {series.isError ? (
        <ServerUnavailable onRetry={series.refetch} />
      ) : live ? (
        <LivePanel status={live} />
      ) : (
        <Pending label="Loading Sun and Earth positions…" />
      )}

      {summary.data && (
        <>
          <h3 className="section-title">Whole mission</h3>
          <MissionMetrics summary={summary.data} />
        </>
      )}
    </>
  )
}
