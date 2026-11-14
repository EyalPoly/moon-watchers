import { expect, test } from '@playwright/test'
import { stubTiles } from './helpers'

test('sample banner shows and the map canvas is not blank', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?data=sample')
  await expect(page.getByText('Sample data')).toBeVisible()
  const canvas = page.locator('.polar-map canvas').first()
  await expect(canvas).toBeVisible()

  // Not blank: the stubbed tiles (half-transparent red) were drawn, so most sample points
  // have some alpha. An empty canvas is fully transparent. Counting colors instead would depend on whether the dashed
  // circle happens to cross a sample point, which changes with the panel's size.
  await expect
    .poll(async () =>
      canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement
        const ctx = c.getContext('2d')!
        let drawn = 0
        for (let i = 0; i < 25; i++) {
          const x = Math.floor((c.width * (i % 5 + 0.5)) / 5)
          const y = Math.floor((c.height * (Math.floor(i / 5) + 0.5)) / 5)
          if (ctx.getImageData(x, y, 1, 1).data[3] > 0) drawn += 1
        }
        return drawn
      }),
    )
    .toBeGreaterThanOrEqual(13)
})
