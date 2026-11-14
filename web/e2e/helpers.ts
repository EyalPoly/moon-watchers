import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { BrowserContext, Page } from '@playwright/test'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const samples = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../contract/samples/${name}`, import.meta.url)), 'utf8')

// context.route, not page.route: with the mock service worker active, image requests
// reach the network from the worker, which page.route cannot see.
export async function stubTiles(context: BrowserContext) {
  await context.route('https://trek.nasa.gov/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  )
}

export async function failTiles(context: BrowserContext) {
  await context.route('https://trek.nasa.gov/**', (route) => route.abort())
}

export async function useConfig(page: Page, config: object) {
  await page.route('**/config.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) }),
  )
}

export async function serveSampleApi(context: BrowserContext, origin: string) {
  await context.route(`${origin}/api/v1/**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '')
    const file = path === 'meta' ? 'meta.json' : path === 'sites' ? 'sites.json' : `${path}.json`
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: samples(file),
    })
  })
}

export async function hangApi(context: BrowserContext, origin: string) {
  await context.route(`${origin}/api/v1/**`, () => new Promise<void>(() => {}))
}

/** Every endpoint on sample answers, whatever the committed config.json says. */
export const ALL_SAMPLE = { api_base: '', sources: { sites: 'sample', horizon: 'sample', summary: 'sample' } }

/** For specs that need sample data: the committed config may point at the live API. */
export async function pinSampleConfig(page: Page) {
  await page.route('**/config.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(ALL_SAMPLE) }),
  )
}
