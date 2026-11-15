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

/** Click the corners of a rectangle centered on a spot of the map that is inside the
 *  planning circle and clear of the tool dialog, legend, map buttons and site pins. */
export async function drawOutline(page: Page, halfWidth: number, halfHeight: number) {
  const map = (await page.locator('.panel .polar-map').first().boundingBox())!
  const obstacles = await page
    .locator('.panel .polar-map [role="dialog"], .panel .polar-map aside, .panel .polar-map button, [data-testid^="pin-"]')
    .evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect()
      return [r.left, r.top, r.right, r.bottom]
    }))
  const pad = 14
  const blocked = (x: number, y: number) =>
    obstacles.some(([l, t, r, b]) => x > l - pad && x < r + pad && y > t - pad && y < b + pad)
  const mx = map.x + map.width / 2
  const my = map.y + map.height / 2
  const reach = (Math.min(map.width, map.height) / 2) * 0.8
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  let best: [number, number] | null = null
  for (let y = map.y; y < map.y + map.height && !best; y += 8) {
    for (let x = map.x; x < map.x + map.width; x += 8) {
      const points = corners.map(([sx, sy]) => [x + sx * halfWidth, y + sy * halfHeight])
      if (points.every(([px, py]) => Math.hypot(px - mx, py - my) < reach && !blocked(px, py))) {
        if (!best || Math.hypot(x - mx, y - my) < Math.hypot(best[0] - mx, best[1] - my)) best = [x, y]
      }
    }
  }
  if (!best) throw new Error('no clear spot on the map for the outline')
  for (const [sx, sy] of corners) await page.mouse.click(best[0] + sx * halfWidth, best[1] + sy * halfHeight)
}
