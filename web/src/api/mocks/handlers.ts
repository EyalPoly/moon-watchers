import { http, HttpResponse } from 'msw'

export interface Samples {
  meta: unknown
  health: unknown
}

export function buildHandlers(samples: Samples) {
  return [
    http.get('*/api/v1/meta', () => HttpResponse.json(samples.meta as Record<string, unknown>)),
    http.get('*/api/v1/health', () => HttpResponse.json(samples.health as Record<string, unknown>)),
  ]
}
