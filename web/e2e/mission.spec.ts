import { expect, test } from '@playwright/test'
import { stubTiles, pinSampleConfig } from './helpers'

test.beforeEach(async ({ page }) => {
  await pinSampleConfig(page)
})

test('a ticket shows verdict, live status, countdowns, and the sky graph on its panel', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  await expect(page.getByRole('heading', { name: 'Sample site A' })).toBeVisible()
  await expect(page.getByText('score', { exact: true })).toBeVisible()
  for (const chip of [/^Sun: \d+%/, /^Earth: \d+%/, /^Slope: 4\.2°/]) {
    await expect(page.getByLabel(chip)).toBeVisible()
  }
  await expect(page.getByRole('region', { name: 'Live status' })).toContainText(/Sun(set|rise) (in|not before)/)
  await expect(page.getByRole('region', { name: 'Live status' })).toContainText(/Earth(set|rise) (in|not before)/)

  await page.getByRole('tab', { name: 'Sky graph' }).click()
  await expect(page.getByRole('img', { name: /^Sky view at 2027-03-01T00:00Z/ })).toBeVisible()
  await expect(page).toHaveURL(/tk=sample_a[^&]*%7Eg/)
})

test('+29.5 d moves the landing one lunar day and Back undoes it', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  await page.getByRole('button', { name: '+1 lunar day' }).click()
  await expect(page).toHaveURL(/2027-03-30T12%3A40Z/)
  await page.goBack()
  await expect(page).not.toHaveURL(/2027-03-30/)
})

test('the time slider moves the viewed time in 10-minute steps and keeps it in the URL', async ({
  page,
  context,
}) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  const slider = page.getByRole('slider', { name: 'Mission time' })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/tau=10/)
  await expect(page.getByText('Day 0, 00:10')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Day 0, 00:10')).toBeVisible()
})

test('a broken mission link opens on defaults without an error screen', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=sample_b~2027-02-30T00:00Z~-4~99&tau=abc&open=9')
  await expect(page.getByRole('heading', { name: 'Sample site B' })).toBeVisible()
  await expect(page.getByText('Day 0, 00:00')).toBeVisible()
  await expect(page.getByText(/error|unavailable/i)).toHaveCount(0)
})

test('new tickets open beside the first, compare side by side, and delete', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  await expect(page.getByRole('button', { name: 'Compare tickets' })).toHaveCount(0)

  await page.getByRole('button', { name: '+ New ticket' }).click()
  await expect(page.getByRole('region', { name: /^Ticket \d view$/ })).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Compare tickets' })).toBeDisabled()

  // The new ticket is the open one: picking a site fills it in.
  await page.getByRole('combobox', { name: 'Site' }).selectOption('sample_b')
  await expect(page.getByRole('region', { name: 'Ticket 2: Sample site B' })).toBeVisible()
  // Ticket 1 is collapsed but still shows its traffic lights.
  await expect(page.getByRole('region', { name: 'Ticket 1: Sample site A' }).getByLabel(/^Sun: \d+%/)).toBeVisible()

  await page.getByRole('button', { name: 'Compare tickets' }).click()
  await expect(page).toHaveURL(/view=compare/)
  const table = page.getByRole('region', { name: 'Compare tickets' }).getByRole('table')
  await expect(table).toContainText('Sample site A')
  await expect(table).toContainText('Sample site B')
  await expect(table.getByText('Optimal')).toHaveCount(1)

  await page.goBack()
  await expect(page).not.toHaveURL(/view=compare/)
  await page.getByRole('button', { name: 'Delete Ticket 2' }).click()
  await expect(page.getByRole('region', { name: /^Ticket \d view$/ })).toHaveCount(1)
})

test('the open card shows the illustrative score box and the warnings strip', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  const card = page.getByRole('region', { name: /^Ticket 1: Sample site A/ })
  await expect(card.getByText(/Illustrative weights and thresholds/)).toBeVisible()
  await expect(card.getByText(/predicted rather than observed/)).toBeVisible()
  await card.getByRole('button', { name: 'Always true' }).click()
  await expect(card.getByText(/Rocks and relief smaller than a terrain cell/)).toBeVisible()
})
