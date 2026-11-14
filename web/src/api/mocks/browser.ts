import { setupWorker } from 'msw/browser'
import { buildHandlers } from './handlers'
import { samples } from './samples'

export const worker = setupWorker(...buildHandlers(samples, window.location.origin))
