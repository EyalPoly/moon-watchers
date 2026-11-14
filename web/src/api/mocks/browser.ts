import { setupWorker } from 'msw/browser'
import health from '@samples/health.json'
import meta from '@samples/meta.json'
import { buildHandlers } from './handlers'

export const worker = setupWorker(...buildHandlers({ meta, health }))
