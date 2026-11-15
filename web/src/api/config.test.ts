import { afterEach, expect, test, vi } from 'vitest'
import { anySample, loadConfig, resolveSource, type AppConfig } from './config'

const realSites: AppConfig = {
  api_base: 'http://localhost:8000',
  sources: { sites: 'real', horizon: 'sample', summary: 'sample' },
}

afterEach(() => vi.unstubAllGlobals())

test('a real source resolves to real without the data=sample override', () => {
  expect(resolveSource(realSites, 'sites', '')).toBe('real')
})

test('?data=sample forces sample for the same config', () => {
  expect(resolveSource(realSites, 'sites', '?data=sample')).toBe('sample')
})

test('meta follows sites', () => {
  expect(resolveSource(realSites, 'meta', '')).toBe('real')
})

test('anySample is false only when every source is real', () => {
  const allReal: AppConfig = {
    api_base: '',
    sources: { sites: 'real', horizon: 'real', summary: 'real' },
  }
  expect(anySample(allReal, '')).toBe(false)
  expect(anySample(realSites, '')).toBe(true)
  expect(anySample(allReal, '?data=sample')).toBe(true)
})

test('a malformed config body falls back to all-sample', async () => {
  vi.stubGlobal('fetch', async () => new Response('{"nope": 1}'))
  const config = await loadConfig('/config.json')
  expect(Object.values(config.sources).every((s) => s === 'sample')).toBe(true)
})

test('a missing config file falls back to all-sample', async () => {
  vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
  const config = await loadConfig('/config.json')
  expect(Object.values(config.sources).every((s) => s === 'sample')).toBe(true)
})

test('a real source with an empty api_base is rejected and falls back to all-sample', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          api_base: '',
          sources: { sites: 'real', horizon: 'sample', summary: 'sample' },
        }),
      ),
  )
  const config = await loadConfig('/config.json')
  expect(Object.values(config.sources).every((s) => s === 'sample')).toBe(true)
})

test('an all-sample config may have an empty api_base', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          api_base: '',
          sources: { sites: 'sample', horizon: 'sample', summary: 'sample' },
        }),
      ),
  )
  expect((await loadConfig('/config.json')).sources.sites).toBe('sample')
})

test('custom points follow the horizon switch, since they need the terrain engine', () => {
  const config = { api_base: 'https://api.example', sources: { sites: 'real', horizon: 'sample', summary: 'sample' } } as const
  expect(resolveSource(config, 'custom', '')).toBe('sample')
  expect(resolveSource({ ...config, sources: { ...config.sources, horizon: 'real' } }, 'custom', '')).toBe('real')
})

test('custom points can stay on sample while the horizon is real', async () => {
  const config = { api_base: 'https://api.example', sources: { sites: 'real', horizon: 'real', summary: 'sample', custom: 'sample' } } as const
  expect(resolveSource(config, 'custom', '')).toBe('sample')
  expect(resolveSource(config, 'horizon', '')).toBe('real')
  const own = { ...config, sources: { ...config.sources, custom: 'real' } } as const
  expect(resolveSource(own, 'custom', '')).toBe('real')
  expect(resolveSource(own, 'custom', '?data=sample')).toBe('sample')
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(config)))
  expect((await loadConfig('/config.json')).sources.custom).toBe('sample')
})

test('the sample banner ignores custom points', () => {
  const config = { api_base: 'https://api.example', sources: { sites: 'real', horizon: 'real', summary: 'real', series: 'real', custom: 'sample' } } as const
  expect(anySample(config, '')).toBe(false)
})

test('series follows summary until sources.series says otherwise', () => {
  const config = { api_base: 'https://api.example', sources: { sites: 'real', horizon: 'real', summary: 'real' } } as const
  expect(resolveSource(config, 'series', '')).toBe('real')
  const own = { ...config, sources: { ...config.sources, series: 'sample' } } as const
  expect(resolveSource(own, 'series', '')).toBe('sample')
  expect(resolveSource(own, 'summary', '')).toBe('real')
})

test('a config without sources.series is valid, and one with it too', async () => {
  const body = { api_base: 'https://api.example', sources: { sites: 'real', horizon: 'real', summary: 'real' } }
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body)))
  expect((await loadConfig('/config.json')).sources.series).toBeUndefined()
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ...body, sources: { ...body.sources, series: 'sample' } })))
  expect((await loadConfig('/config.json')).sources.series).toBe('sample')
})

test('the sample banner shows while the series is on sample', () => {
  const config = { api_base: 'https://api.example', sources: { sites: 'real', horizon: 'real', summary: 'real', series: 'sample' } } as const
  expect(anySample(config, '')).toBe(true)
})
