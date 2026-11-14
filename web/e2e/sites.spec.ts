import { expect, test, type Page } from '@playwright/test'

async function stubTiles(page: Page) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.route('https://trek.nasa.gov/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: png }),
  )
}

test('pins select a site, update the URL and history, and are labeled as sample', async ({ page }) => {
  await stubTiles(page)
  await page.goto('/')
  await expect(page.getByTestId(/^pin-/)).toHaveCount(3)

  await page.getByTestId('pin-sample_b').click()
  await expect(page.getByRole('heading', { name: 'Sample site B' })).toBeVisible()
  await expect(page).toHaveURL(/site=sample_b/)
  await expect(page.getByTestId('sample-tag')).toBeVisible()
  await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible()

  await page.goBack()
  await expect(page).not.toHaveURL(/site=/)
  await expect(page.getByRole('heading', { name: 'Sample site B' })).toHaveCount(0)
})

test('a broken link opens the map on defaults without an error screen', async ({ page }) => {
  await stubTiles(page)
  await page.goto('/?site=nonexistent')
  await expect(page.getByTestId(/^pin-/)).toHaveCount(3)
  await expect(page.getByRole('heading', { name: /Sample site/ })).toHaveCount(0)
  await expect(page.getByText(/error|unavailable/i)).toHaveCount(0)
})

test('a down server shows Server unavailable with retry while the map stays visible', async ({ page }) => {
  await stubTiles(page)
  await page.route('**/config.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        api_base: 'http://localhost:9',
        sources: { sites: 'real', horizon: 'sample', summary: 'sample' },
      }),
    }),
  )
  await page.goto('/')
  await expect(page.getByText('Server unavailable')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page.locator('.polar-map canvas').first()).toBeVisible()
})
