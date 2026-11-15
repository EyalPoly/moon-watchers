import { expect, test } from '@playwright/test'
import { failTiles, hangApi, serveSampleApi, stubTiles, useConfig } from './helpers'

const API = 'http://localhost:9123'
const allSample = { api_base: '', sources: { sites: 'sample', horizon: 'sample', summary: 'sample' } }
const realSites = { api_base: API, sources: { sites: 'real', horizon: 'sample', summary: 'sample' } }

test('pins select a site, update the URL and history, and are labeled as sample', async ({ page, context }) => {
  await stubTiles(context)
  await useConfig(page, allSample)
  await page.goto('/')
  await expect(page.getByTestId(/^pin-/)).toHaveCount(3)

  await page.getByTestId('pin-sample_b').click()
  await expect(page.getByRole('heading', { name: /^Sample site B/ })).toBeVisible()
  await expect(page).toHaveURL(/tk=sample_b/)
  await expect(page.getByTestId('sample-tag')).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit input' }).click()
  await page.getByRole('button', { name: 'Apply site A' }).click()
  await page.getByRole('button', { name: 'Whole mission', exact: true }).click()
  await expect(page.getByTestId('sample-tag')).toBeVisible()
  await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible()

  await page.goBack()
  await expect(page.getByRole('button', { name: 'Apply site A' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Edit input' })).toBeVisible()
  await page.goBack()
  await expect(page).not.toHaveURL(/tk=/)
  await expect(page.getByRole('heading', { name: /^Sample site B/ })).toHaveCount(0)
})

test('a broken link opens the map on defaults without an error screen', async ({ page, context }) => {
  await stubTiles(context)
  await useConfig(page, allSample)
  await page.goto('/?site=nonexistent')
  await expect(page.getByTestId(/^pin-/)).toHaveCount(3)
  await expect(page.getByRole('heading', { name: /Sample site/ })).toHaveCount(0)
  await expect(page.getByText(/error|unavailable/i)).toHaveCount(0)
})

test('a refused connection shows Server unavailable with retry while the map stays visible', async ({
  page,
  context,
}) => {
  await stubTiles(context)
  await useConfig(page, { ...realSites, api_base: 'http://localhost:9' })
  await page.goto('/')
  await expect(page.getByText('Server unavailable')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page.locator('.polar-map canvas').first()).toBeVisible()
})

test('a server that never answers does not hide the map and ends in Server unavailable', async ({
  page,
  context,
}) => {
  await stubTiles(context)
  await hangApi(context, API)
  await useConfig(page, realSites)
  await page.goto('/')
  await expect(page.locator('.polar-map canvas').first()).toBeVisible()
  await expect(page.getByText('Server unavailable')).toBeVisible({ timeout: 20_000 })
})

test('with a real catalog the banner shows only once a card uses sample horizon or summary', async ({
  page,
  context,
}) => {
  await stubTiles(context)
  await serveSampleApi(context, API)
  await useConfig(page, realSites)
  await page.goto('/')
  await expect(page.getByTestId(/^pin-/)).toHaveCount(3)
  // Only the catalog is visible: it is real, so nothing is labeled.
  await expect(page.getByText('Sample data', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('sample-tag')).toHaveCount(0)

  // The card's horizon and verdict are still sample answers, so both labels appear. (Site B:
  // nearer the pole, so its pin is inside the map at the test's window size.)
  await page.getByTestId('pin-sample_b').click()
  await expect(page.getByRole('heading', { name: /^Sample site B/ })).toBeVisible()
  await expect(page.getByTestId('sample-tag')).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit input' }).click()
  await page.getByRole('button', { name: 'Apply site A' }).click()
  await page.getByRole('button', { name: 'Whole mission', exact: true }).click()
  await expect(page.getByTestId('sample-tag')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Sample data' })).toBeVisible()
})

test('failing tiles show Basemap unavailable while pins keep working', async ({ page, context }) => {
  await failTiles(context)
  await useConfig(page, allSample)
  await page.goto('/')
  await expect(page.getByText('Basemap unavailable')).toBeVisible()
  await expect(page.getByTestId(/^pin-/)).toHaveCount(3)
})
