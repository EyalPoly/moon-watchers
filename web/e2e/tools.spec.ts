import { expect, test, type Page } from '@playwright/test'
import { stubTiles, pinSampleConfig } from './helpers'

test.beforeEach(async ({ page }) => {
  await pinSampleConfig(page)
})

const panels = (page: Page) => page.getByRole('region', { name: / view$/ })

test('a ticket can be named, and the name shows everywhere and stays in the link', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  await page.getByRole('textbox', { name: 'Ticket name' }).fill('Shackleton plan B')
  await page.getByRole('textbox', { name: 'Ticket name' }).press('Enter')
  await expect(page).toHaveURL(/n%3AShackleton\+plan\+B/)
  await expect(page.getByRole('region', { name: 'Shackleton plan B view' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Shackleton plan B: Sample site A' })).toBeVisible()
})

test('a new site can be added by latitude and longitude', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Site' }).selectOption('custom')
  await page.getByRole('textbox', { name: 'Site latitude' }).fill('-80')
  await expect(page.getByText(/Latitude -90° to -84°/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add site' })).toBeDisabled()

  await page.getByRole('textbox', { name: 'Site latitude' }).fill('-87.5')
  await page.getByRole('textbox', { name: 'Site longitude' }).fill('45')
  await page.getByRole('button', { name: 'Add site' }).click()
  await expect(page).toHaveURL(/tk=pt_s87500_e045000/)
  await expect(page.getByRole('heading', { name: 'Point 87.500°S 45.000°E' })).toBeVisible()
  // The new site gets a verdict like any catalog site.
  await expect(page.getByLabel(/^Sun: \d+%/)).toBeVisible()
})

test('mission time on the Moon is set in days and hours, and updates the numbers', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  const sun = page.getByLabel(/^Sun: \d+%/)
  await expect(sun).toBeVisible()
  const before = await sun.getAttribute('aria-label')

  await page.getByRole('spinbutton', { name: 'Mission days' }).fill('3')
  await page.getByRole('spinbutton', { name: 'Mission hours' }).fill('6')
  await page.getByRole('spinbutton', { name: 'Mission hours' }).press('Enter')
  await expect(page).toHaveURL(/%7E3\.25%7E/)
  await expect(page.getByText('3 d 6 h on the Moon')).toBeVisible()
  await expect.poll(() => sun.getAttribute('aria-label')).not.toBe(before)

  await page.getByRole('combobox', { name: 'Mission length preset' }).selectOption('90')
  await expect(page).toHaveURL(/%7E90%7E/)
})

test('panels and the ticket column can be resized by dragging', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=sample_a&tk=sample_b')
  const first = panels(page).first()
  const startH = (await first.boundingBox())!.height
  const handle = page.getByRole('separator', { name: 'Resize Ticket 1' })
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 150, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await first.boundingBox())!.height).toBeGreaterThan(startH + 100)

  const side = page.getByRole('complementary', { name: 'Mission tickets' })
  const startW = (await side.boundingBox())!.width
  const divider = page.getByRole('separator', { name: 'Resize the ticket column' })
  const db = (await divider.boundingBox())!
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2)
  await page.mouse.down()
  await page.mouse.move(db.x - 120, db.y + db.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await side.boundingBox())!.width).toBeGreaterThan(startW + 100)
})

test('an area outlined on the map grid gives ranked spots that open as tickets', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=~2027-03-01T00:00Z~29.53~2~n:Survey')
  await page.getByRole('button', { name: 'Select area' }).click()
  const tool = page.getByRole('dialog', { name: 'Select an area' })
  await expect(tool).toBeVisible()

  // With no site the map is centered on the pole, well inside the custom-point area.
  const map = (await page.locator('.panel .polar-map').first().boundingBox())!
  const cx = map.x + map.width / 2 - 80
  const cy = map.y + map.height / 2
  for (const [dx, dy] of [[-60, -60], [60, -60], [60, 60], [-60, 60]]) await page.mouse.click(cx + dx, cy + dy)
  await expect(tool.getByText('(4 points)')).toBeVisible()

  await tool.getByRole('button', { name: 'Find best areas' }).click()
  const list = tool.getByRole('list', { name: 'Best areas' })
  await expect(list.getByRole('listitem').first()).toContainText('#1')
  await list.getByRole('checkbox').nth(1).check()
  await tool.getByRole('button', { name: 'Open 2 tickets' }).click()

  await expect(page.getByRole('region', { name: /^Survey · area #1: Point / })).toBeVisible()
  await expect(page.getByRole('region', { name: /^Survey · area #2: Point / })).toBeVisible()
  await expect(page).toHaveURL(/tk=pt_s\d+_[ew]\d+/)
})
