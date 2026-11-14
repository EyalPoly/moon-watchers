import { z } from 'zod'

export interface UrlState {
  site: string | null
}

const siteId = z.string().regex(/^[a-z0-9_]{1,64}$/)

export function parseUrlState(search: string, knownSiteIds: readonly string[]): UrlState {
  const parsed = siteId.safeParse(new URLSearchParams(search).get('site'))
  return { site: parsed.success && knownSiteIds.includes(parsed.data) ? parsed.data : null }
}

export function serializeUrlState(state: UrlState, base = ''): string {
  const params = new URLSearchParams(base)
  if (state.site === null) params.delete('site')
  else params.set('site', state.site)
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}
