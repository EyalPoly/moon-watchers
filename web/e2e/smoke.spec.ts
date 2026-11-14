import { expect, test } from '@playwright/test'

test('sample banner shows and the map canvas is not blank', async ({ page }) => {
  await page.route('https://trek.nasa.gov/**', async (route) => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    await route.fulfill({ status: 200, contentType: 'image/png', body: png })
  })
  await page.goto('/?data=sample')
  await expect(page.getByText('Sample data')).toBeVisible()
  const canvas = page.locator('.polar-map canvas').first()
  await expect(canvas).toBeVisible()

  await expect
    .poll(async () =>
      canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement
        const ctx = c.getContext('2d')!
        const seen = new Set<string>()
        for (let i = 0; i < 25; i++) {
          const x = Math.floor((c.width * (i % 5 + 0.5)) / 5)
          const y = Math.floor((c.height * (Math.floor(i / 5) + 0.5)) / 5)
          seen.add(Array.from(ctx.getImageData(x, y, 1, 1).data).join(','))
        }
        return seen.size
      }),
    )
    .toBeGreaterThanOrEqual(2)
})
