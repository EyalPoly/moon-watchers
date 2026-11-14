import { expect, test } from '@playwright/test'
import { stubTiles, pinSampleConfig } from './helpers'

test.beforeEach(async ({ page, context }) => {
  await pinSampleConfig(page)
  await stubTiles(context)
})

test('changing a weight rescored the card, lands in the link, survives a reload and Back undoes it', async ({
  page,
}) => {
  await page.goto('/?site=sample_a')
  const card = page.getByRole('region', { name: /^Ticket 1: Sample site A/ })
  const score = card.locator('.score .num')
  await expect(score).toBeVisible()
  const before = await score.textContent()
  await expect(card.getByText('custom settings')).toHaveCount(0)

  await page.getByRole('button', { name: 'Score settings' }).click()
  const slider = page.getByRole('slider', { name: 'station contact' })
  await slider.fill('0.5')
  await slider.dispatchEvent('pointerup')

  await expect(page).toHaveURL(/w=0\.25,0\.5,0\.15,0\.15,0\.1,0\.1,0(&|$)/)
  await expect(card.getByText('custom settings')).toBeVisible()
  await expect(score).not.toHaveText(before ?? '')
  await expect(page.getByRole('button', { name: 'Score settings (custom)' })).toBeVisible()

  await page.reload()
  await expect(card.getByText('custom settings')).toBeVisible()

  await page.goBack()
  await expect(page).not.toHaveURL(/w=/)
  await expect(card.getByText('custom settings')).toHaveCount(0)
  await expect(score).toHaveText(before ?? '')
})
