import { expect, test } from '@playwright/test'
import { pinSampleConfig, stubTiles } from './helpers'

test.beforeEach(async ({ page, context }) => {
  await pinSampleConfig(page)
  await stubTiles(context)
})

const TWO_SITES = '/?tk=sample_a~2027-03-01T00:00Z~29.53~2~3&tk=sample_c~2027-03-01T00:00Z~14~2~3'

test('Compare timelines opens the Timelines screen with a panel, score and rows per site', async ({ page }) => {
  await page.goto(TWO_SITES)
  await page.getByRole('button', { name: /Compare timelines/ }).click()
  await expect(page).toHaveURL(/screen=timelines/)
  await expect(page.getByRole('heading', { name: 'Mission timelines' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Timelines' })).toHaveAttribute('aria-current', 'page')

  for (const letter of ['A', 'B']) {
    const panel = page.getByRole('region', { name: `Site ${letter} timeline` })
    await expect(panel.getByLabel(/^Score \d/)).toBeVisible()
    for (const row of ['Sun visible', 'Earth contact', 'Light and communication overlap', 'Unknown terrain']) {
      await expect(panel.getByRole('img', { name: new RegExp(`^${row.replace('+', '\\+')}: \\d+ period`) })).toBeVisible()
    }
  }
  // Bars carry their real dates.
  const sun = page.getByRole('region', { name: 'Site A timeline' }).getByRole('img', { name: /^Sun visible/ })
  await expect(sun.locator('.tl-bar').first()).toHaveAttribute('title', /^Sun visible: \d+ \w+ 2027, \d\d:\d\d UTC → /)
  // The shorter mission is shaded after its end.
  await expect(page.getByRole('region', { name: 'Site B timeline' }).locator('.tl-after').first()).toBeVisible()
  // The comparison table sits under the chart.
  await expect(page.getByRole('region', { name: 'Compare sites' }).getByRole('table')).toContainText('Sample site C')

  await page.goBack()
  await expect(page).not.toHaveURL(/screen=timelines/)
  await expect(page.getByRole('heading', { name: 'Site calculator' })).toBeVisible()
})

test('clicking a track moves the viewed time, shared with the South pole screen', async ({ page }) => {
  await page.goto(`${TWO_SITES}&screen=timelines`)
  const track = page.getByRole('region', { name: 'Site A timeline' }).getByRole('img', { name: /^Earth contact/ })
  const box = (await track.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page).toHaveURL(/tau=\d+/)
  const tau = Number(new URL(page.url()).searchParams.get('tau'))
  // Half of a 29.53-day axis, give or take a pixel.
  expect(Math.abs(tau - 29.53 * 1440 / 2)).toBeLessThan(200)

  await page.getByRole('button', { name: 'Site Calculator' }).click()
  await expect(page).toHaveURL(new RegExp(`tau=${tau}`))
  await expect(page.getByRole('heading', { name: 'Site calculator' })).toBeVisible()
})

test('with no located sites the Timelines screen says what to do', async ({ page }) => {
  await page.goto('/?screen=timelines')
  await expect(page.getByText(/No sites to show/)).toBeVisible()
  await page.getByRole('button', { name: 'Go to the South pole screen' }).click()
  await expect(page).not.toHaveURL(/screen=timelines/)
})
