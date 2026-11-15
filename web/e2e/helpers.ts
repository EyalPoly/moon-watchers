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

/** Click the map at (x, y), or at the nearest nearby spot that is not on a site pin. */
export async function clickMapAvoidingPins(page: Page, x: number, y: number) {
  const pins = await page.getByTestId(/^pin-/).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return [r.x + r.width / 2, r.y + r.height / 2]
    }),
  )
  const clear = (px: number, py: number) => pins.every(([ox, oy]) => Math.hypot(px - ox, py - oy) > 30)
  for (let radius = 0; radius <= 120; radius += 10) {
    for (let step = 0; step < Math.max(1, radius / 5); step++) {
      const angle = (2 * Math.PI * step) / Math.max(1, radius / 5)
      const px = x + radius * Math.cos(angle)
      const py = y + radius * Math.sin(angle)
      if (clear(px, py)) {
        await page.mouse.click(px, py)
        return
      }
    }
  }
  throw new Error('no map spot clear of site pins')
}
