import { useMemo } from 'react'
import { HOUSTON } from '../api/stations'
import type { Scenario, StationPoint } from '../api/types'
import type { MissionState } from './urlState'

// Interim until the physics team's P5: the solar-lander weights.
const SOLAR_LANDER: Scenario['w'] = [1, 1, 1, 0]

export function toScenario(
  siteId: string,
  mission: Pick<MissionState, 't0' | 'days' | 'panel' | 'antenna'>,
  station: StationPoint = HOUSTON,
): Scenario {
  return {
    site: siteId,
    t0: mission.t0,
    days: mission.days,
    panel: mission.panel,
    antenna: mission.antenna,
    w: SOLAR_LANDER,
    station,
  }
}

/** The scenario for a site and mission, stable while its values don't change. */
export function useScenario(
  siteId: string | null,
  mission: MissionState,
  station: StationPoint = HOUSTON,
): Scenario | null {
  const { t0, days, panel, antenna } = mission
  const { lat_deg, lon_deg, alt_m, min_el_deg } = station
  return useMemo(
    () =>
      siteId === null
        ? null
        : toScenario(siteId, { t0, days, panel, antenna }, { lat_deg, lon_deg, alt_m, min_el_deg }),
    [siteId, t0, days, panel, antenna, lat_deg, lon_deg, alt_m, min_el_deg],
  )
}
