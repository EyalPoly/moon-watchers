import { useMemo } from 'react'
import type { Meta, Scenario } from '../api/types'
import type { EarthStationChoice } from './tickets'
import type { MissionState } from './urlState'

// Interim until the physics team's P5: the solar-lander weights.
const SOLAR_LANDER: Scenario['w'] = [1, 1, 1, 0]
const ANY_STATION: EarthStationChoice = { station: 'any', lat: null, lon: null }

export function toScenario(
  siteId: string,
  mission: Pick<MissionState, 't0' | 'days' | 'mast'>,
  earth: EarthStationChoice = ANY_STATION,
): Scenario {
  return {
    site: siteId,
    t0: mission.t0,
    days: mission.days,
    mast: mission.mast,
    w: SOLAR_LANDER,
    station: earth.station,
    ...(earth.station === 'custom' ? { station_lat_deg: earth.lat ?? 0, station_lon_deg: earth.lon ?? 0 } : {}),
  }
}

/** The scenario for a site and mission, stable while its values don't change. */
export function useScenario(
  siteId: string | null,
  mission: MissionState,
  earth: EarthStationChoice = ANY_STATION,
): Scenario | null {
  const { t0, days, mast } = mission
  const { station, lat, lon } = earth
  return useMemo(
    () => (siteId === null ? null : toScenario(siteId, { t0, days, mast }, { station, lat, lon })),
    [siteId, t0, days, mast, station, lat, lon],
  )
}

/** "all DSN sites", "Madrid (Spain)" or "31.25°, 34.79°". */
export function stationLabel(earth: EarthStationChoice, stations: Meta['stations']): string {
  if (earth.station === 'any') return 'all DSN sites'
  if (earth.station === 'custom') return `${earth.lat ?? 0}°, ${earth.lon ?? 0}°`
  return stations.find((s) => s.id === earth.station)?.name ?? earth.station
}
