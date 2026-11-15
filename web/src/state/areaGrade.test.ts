import { expect, test, vi } from 'vitest'
import { SCORE_DEFAULTS } from '../api/scoreSettings'
import { HOUSTON } from '../api/stations'
import type { Scenario, Site, Summary } from '../api/types'
import { cellGrader } from './areaGrade'
import { toScenario } from './scenario'

const ticket = { t0: '2027-03-01T00:00Z', days: 29.53, panel: 2, antenna: 3, station: HOUSTON }
const settings = SCORE_DEFAULTS

function fakeApi() {
  return {
    createCustomSite: vi.fn(async () => ({ id: 'pt_s87500_e045000' }) as Site),
    getSummary: vi.fn(async (_: Scenario) => ({ score: { value: 63.5 } }) as Summary),
  }
}

test('grades a map point with the custom-point and summary calls for the ticket mission', async () => {
  const api = fakeApi()
  const grade = cellGrader(api, ticket, settings)
  expect(await grade({ lat: -87.5, lon: 45 })).toBe(63.5)
  expect(api.createCustomSite).toHaveBeenCalledWith(-87.5, 45)
  expect(api.getSummary).toHaveBeenCalledWith(toScenario('pt_s87500_e045000', ticket, ticket.station, settings))
})

test('a point that cannot be created is not graded', async () => {
  const api = fakeApi()
  api.createCustomSite.mockRejectedValueOnce(new Error('rate limited'))
  await expect(cellGrader(api, ticket, settings)({ lat: -87.5, lon: 45 })).rejects.toThrow('rate limited')
  expect(api.getSummary).not.toHaveBeenCalled()
})
