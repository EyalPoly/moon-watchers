import { setupWorker } from 'msw/browser'
import health from '@samples/health.json'
import meta from '@samples/meta.json'
import sites from '@samples/sites.json'
import siteA from '@samples/sites/sample_a.json'
import siteB from '@samples/sites/sample_b.json'
import siteC from '@samples/sites/sample_c.json'
import { buildHandlers } from './handlers'

const site = { sample_a: siteA, sample_b: siteB, sample_c: siteC }

export const worker = setupWorker(...buildHandlers({ meta, health, sites, site }))
