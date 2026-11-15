import { expect, test } from '@playwright/test'
import { stubTiles, pinSampleConfig } from './helpers'

test.beforeEach(async ({ page, context }) => {
  await pinSampleConfig(page)
  await stubTiles(context)
})

async function openSettings(page: import('@playwright/test').Page) {
  if (!(await page.getByRole('dialog', { name: 'Manual Selection' }).isVisible())) {
    await page.getByRole('button', { name: 'Manual Selection' }).click()
  }
  await page.getByRole('dialog', { name: 'Manual Selection' }).getByRole('button', { name: /Grading Weights/ }).click()
}

const apply = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Grading Weights' }).getByRole('button', { name: 'Apply', exact: true }).click()

test('changing a weight rescored the card, lands in the link, survives a reload and Back undoes it', async ({
  page,
}) => {
  await page.goto('/?site=sample_a')
  await page.locator('.score-details > summary').first().click()
  const card = page.getByRole('region', { name: /^Site A(:|$)/ })
  const score = card.locator('.score .num')
  await expect(score).toBeVisible()
  const before = await score.textContent()
  await expect(card.getByText('custom settings')).toHaveCount(0)

  await openSettings(page)
  const slider = page.getByRole('slider', { name: 'station contact' })
  await slider.fill('0.5')
  await slider.dispatchEvent('pointerup')
  await expect(page).not.toHaveURL(/w=/)
  await apply(page)

  await expect(page).toHaveURL(/w=0\.25,0\.5,0\.15,0\.15,0\.1,0\.1,0(&|$)/)
  await expect(card.getByText('custom settings')).toBeVisible()
  await expect(score).not.toHaveText(before ?? '')
  await expect(page.getByRole('button', { name: 'Grading Weights (custom)' })).toBeVisible()

  await page.reload()
  await page.locator('.score-details > summary').first().click()
  await expect(card.getByText('custom settings')).toBeVisible()

  await page.goBack()
  await expect(page).not.toHaveURL(/w=/)
  await expect(card.getByText('custom settings')).toHaveCount(0)
  await expect(score).toHaveText(before ?? '')
})

async function dragContact(page: import('@playwright/test').Page, values: string[]) {
  const slider = page.getByRole('slider', { name: 'station contact' })
  for (const v of values) await slider.fill(v)
  await slider.dispatchEvent('pointerup')
}

test('a drag that returns to the start leaves the URL and history as they were', async ({ page }) => {
  await page.goto('/?site=sample_a')
  await openSettings(page)
  const before = await page.evaluate(() => ({ url: location.search, length: history.length }))
  await dragContact(page, ['0.5', '0.25'])
  await apply(page)
  expect(await page.evaluate(() => ({ url: location.search, length: history.length }))).toEqual(before)
  await expect(page.getByRole('button', { name: 'Grading Weights', exact: true })).toBeVisible()
})

test('an unrelated URL change after such a drag survives the next drag', async ({ page }) => {
  await page.goto('/?site=sample_a')
  await openSettings(page)
  await dragContact(page, ['0.5', '0.25'])
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Close area tool' }).click()
  await page.getByRole('button', { name: '+ Add site' }).click()
  const tickets = await page.evaluate(() => new URLSearchParams(location.search).get('tk'))
  expect(tickets).not.toBeNull()
  await openSettings(page)
  await dragContact(page, ['0.5'])
  await apply(page)
  await expect(page).toHaveURL(/w=0\.25,0\.5,/)
  expect(await page.evaluate(() => new URLSearchParams(location.search).get('tk'))).toBe(tickets)
})
