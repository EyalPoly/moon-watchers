import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { samples } from '../src/api/mocks/samples'
import { SCORE_DEFAULTS } from '../src/api/scoreSettings'
import { HOUSTON } from '../src/api/stations'
import { syntheticSummary } from '../src/api/mocks/synthetic'
import type { Scenario } from '../src/api/types'
import { parseIsoMinute } from '../src/time'

// The committed summary samples are what the Python models validate (api.contract check).
// They must match what the mock layer serves, so a generator change that forgets to
// refresh them fails here. Refresh with: UPDATE_SAMPLES=1 pnpm test
// Vitest runs from web/.
const dir = (name: string) => resolve(process.cwd(), '../contract/samples/summary', name)

test.each(['sample_a', 'sample_b', 'sample_c'])('summary sample for %s matches the generator', (id) => {
  const scenario: Scenario = { site: id, t0: '2027-03-01T00:00Z', days: 30, panel: 2, antenna: 3, station: HOUSTON, ...SCORE_DEFAULTS }
  const fresh = syntheticSummary(scenario, samples.site[id], samples.horizon[id], parseIsoMinute(scenario.t0) as number)
  expect(fresh.scenario).toMatchObject({ w: [0.25, 0.25, 0.15, 0.15, 0.1, 0.1, 0], sun_req: 6, slope: [0, 15, 15], psr: true, margin: 12, colors: [70, 40] })
  const path = dir(`${id}.json`)
  if (process.env.UPDATE_SAMPLES || !existsSync(path)) writeFileSync(path, JSON.stringify(fresh, null, 2) + '\n')
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)))
})
