import health from '@samples/health.json'
import horizonA from '@samples/horizon/sample_a.json'
import horizonB from '@samples/horizon/sample_b.json'
import horizonC from '@samples/horizon/sample_c.json'
import meta from '@samples/meta.json'
import sites from '@samples/sites.json'
import siteA from '@samples/sites/sample_a.json'
import siteB from '@samples/sites/sample_b.json'
import siteC from '@samples/sites/sample_c.json'
import type { Horizon } from '../types'
import type { Samples } from './handlers'

// One place that bundles every sample answer, for the browser worker and the tests.
export const samples: Samples = {
  meta,
  health,
  sites,
  site: { sample_a: siteA, sample_b: siteB, sample_c: siteC },
  horizon: { sample_a: horizonA, sample_b: horizonB, sample_c: horizonC } as Record<string, Horizon>,
}
