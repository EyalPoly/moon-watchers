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
