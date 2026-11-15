import type { LatLon } from '../api/points'
import type { ScoreSettings } from '../api/scoreSettings'
import type { Scenario, Site, Summary } from '../api/types'
import { toScenario } from './scenario'
import type { Ticket } from './tickets'

interface GradingApi {
  createCustomSite(lat: number, lon: number): Promise<Site>
  getSummary(scenario: Scenario): Promise<Summary>
}

/** Grades one map point the way a site card is graded: for the ticket's mission and the current weights. */
export function cellGrader(
  api: GradingApi,
  ticket: Pick<Ticket, 't0' | 'days' | 'panel' | 'antenna' | 'station'>,
  settings: ScoreSettings,
): (center: LatLon) => Promise<number> {
  return async (center) => {
    const site = await api.createCustomSite(center.lat, center.lon)
    const summary = await api.getSummary(toScenario(site.id, ticket, ticket.station, settings))
    return summary.score.value
  }
}
