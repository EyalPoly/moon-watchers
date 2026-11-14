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
  await expect(page.getByRole('heading', { name: 'Sample site B' })).toBeVisible()
  await expect(page).toHaveURL(/site=sample_b/)
  await expect(page.getByTestId('sample-tag')).toBeVisible()
  await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible()

  await page.goBack()
  await expect(page).not.toHaveURL(/site=/)
  await expect(page.getByRole('heading', { name: 'Sample site B' })).toHaveCount(0)
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

test('the banner and tags disappear for real catalog data even while other sources are sample', async ({
  page,
  context,
}) => {
  await stubTiles(context)
  await serveSampleApi(context, API)
  await useConfig(page, realSites)
  await page.goto('/')
  await expect(page.getByTestId(/^pin-/)).toHaveCount(3)
  await page.getByTestId('pin-sample_a').click()
  await expect(page.getByRole('heading', { name: 'Sample site A' })).toBeVisible()
  await expect(page.getByText('Sample data', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('sample-tag')).toHaveCount(0)
})

test('failing tiles show Basemap unavailable while pins keep working', async ({ page, context }) => {
  await failTiles(context)
  await useConfig(page, allSample)
  await page.goto('/')
  await expect(page.getByText('Basemap unavailable')).toBeVisible()
  await expect(page.getByTestId(/^pin-/)).toHaveCount(3)
})
