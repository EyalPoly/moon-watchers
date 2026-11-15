import { expect, test, type Page } from '@playwright/test'
import { pinSampleConfig, stubTiles } from './helpers'

test.beforeEach(async ({ page }) => {
  await pinSampleConfig(page)
})

const cards = (page: Page) => page.getByRole('region', { name: /^Site [A-Z]+$/ })
const card = (page: Page, letter: string) => page.getByRole('region', { name: `Site ${letter}`, exact: true })

test('a point shows its status, live values, countdowns, verdict, and its ridge graph', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  await expect(page.getByRole('heading', { name: /^Sample site A/ })).toBeVisible()
  const a = card(page, 'A')
  for (const label of ['Light', 'Earth DTE', 'Slope', 'Sun elev.', 'Earth elev.', 'Local slope']) {
    await expect(a.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(a.getByText('Gentle', { exact: true })).toBeVisible()
  await page.locator('.score-details > summary').first().click()
  for (const chip of [/^Sun: \d+%/, /^Earth: \d+%/, /^Slope: 4\.2°/]) {
    await expect(page.getByLabel(chip)).toBeVisible()
  }
  await expect(a.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(page.getByLabel('Live status')).toContainText(/Sun(set|rise) (in|not before)/)
  await expect(page.getByLabel('Live status')).toContainText(/Earth(set|rise) (in|not before)/)

  await page.getByRole('button', { name: 'Ridge Graph' }).click()
  await expect(page.getByText('Local Horizon', { exact: true })).toBeVisible()
  await expect(page.getByText('SUN BEARING')).toBeVisible()
  await expect(page.getByRole('img', { name: /^Sky view at 2027-03-01T00:00Z/ })).toBeVisible()
  await expect(page).toHaveURL(/tk=sample_a[^&]*%7Eg/)
})

test('+29.5 d changes the landing only when the point is applied, and Back undoes it', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  await page.getByRole('button', { name: 'Edit site A' }).click()
  await page.getByRole('button', { name: '+1 lunar day' }).click()
  await expect(page.getByLabel('Landing date', { exact: true })).toHaveValue('2027-03-30')
  await expect(page).not.toHaveURL(/2027-03-30/)

  await page.getByRole('button', { name: /Apply site A/ }).click()
  await expect(page).toHaveURL(/2027-03-30T12%3A40Z/)
  await expect(page.getByRole('button', { name: 'Edit site A' })).toBeVisible()
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
  await expect(page.getByRole('heading', { name: /^Sample site B/ })).toBeVisible()
  await expect(page.getByText('Day 0, 00:00')).toBeVisible()
  await expect(page.getByText(/error|unavailable/i).filter({ visible: true })).toHaveCount(0)
})

test('new points open beside the first, compare side by side, and delete', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  await expect(page.getByRole('button', { name: /Compare timelines/ })).toHaveCount(0)

  await page.getByRole('button', { name: '+ Add site' }).click()
  await expect(cards(page)).toHaveCount(2)
  await expect(page.getByRole('button', { name: /Compare timelines/ })).toBeDisabled()
  await expect(page.getByText('2 SAVED')).toHaveCount(0)
  await expect(page.getByText(/1 SAVED\s+\/\s+1 DRAFT/)).toBeVisible()

  // The new point is the open one: choosing a catalog site and applying fills it in.
  const b = card(page, 'B')
  await expect(b.getByText('New site')).toBeVisible()
  await b.getByRole('combobox', { name: 'Site' }).selectOption('sample_b')
  await b.getByRole('button', { name: /Apply site B/ }).click()
  await expect(page.getByRole('heading', { name: /^Sample site B/ })).toBeVisible()
  // Applying B leaves A's results visible for comparison.
  await expect(card(page, 'A').getByText('Light', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /Compare timelines/ }).click()
  await expect(page).toHaveURL(/view=compare/)
  const table = page.getByRole('region', { name: 'Compare sites' }).getByRole('table')
  await expect(table).toContainText('Sample site A')
  await expect(table).toContainText('Sample site B')
  await expect(table.getByText('Optimal')).toHaveCount(1)

  await page.goBack()
  await expect(page).not.toHaveURL(/view=compare/)
  await page.getByRole('button', { name: 'Delete site B' }).click()
  await expect(cards(page)).toHaveCount(1)
})

test('the open card shows the illustrative score box and the warnings strip', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  await page.locator('.score-details > summary').first().click()
  const card = page.getByRole('region', { name: /^Site A(:|$)/ })
  await expect(card.getByText(/Illustrative weights and thresholds/)).toBeVisible()
  await expect(card.getByText(/predicted rather than observed/)).toBeVisible()
  await card.getByRole('button', { name: 'Always true' }).click()
  await expect(card.getByText(/Rocks and relief smaller than a terrain cell/)).toBeVisible()
})
