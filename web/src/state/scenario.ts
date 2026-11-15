import { useMemo } from 'react'
import { SCORE_DEFAULTS, type ScoreSettings } from '../api/scoreSettings'
import { HOUSTON } from '../api/stations'
import type { Scenario, StationPoint } from '../api/types'
import type { MissionState } from './urlState'

export function toScenario(
  siteId: string,
  mission: Pick<MissionState, 't0' | 'days' | 'panel' | 'antenna'>,
  station: StationPoint = HOUSTON,
  settings: ScoreSettings = SCORE_DEFAULTS,
): Scenario {
  return {
    site: siteId,
    t0: mission.t0,
    days: mission.days,
    panel: mission.panel,
    antenna: mission.antenna,
    station,
    ...settings,
  }
}

/** The scenario for a site and mission, stable while its values don't change. */
export function useScenario(
  siteId: string | null,
  mission: MissionState,
  station: StationPoint = HOUSTON,
  settings: ScoreSettings = SCORE_DEFAULTS,
): Scenario | null {
  const { t0, days, panel, antenna } = mission
  const { lat_deg, lon_deg, alt_m, min_el_deg } = station
  return useMemo(
    () =>
      siteId === null
        ? null
        : toScenario(siteId, { t0, days, panel, antenna }, { lat_deg, lon_deg, alt_m, min_el_deg }, settings),
    [siteId, t0, days, panel, antenna, lat_deg, lon_deg, alt_m, min_el_deg, settings],
  )
}
