import { expect, test, type Page } from '@playwright/test'
import { pinSampleConfig, stubTiles } from './helpers'

test.beforeEach(async ({ page }) => {
  await pinSampleConfig(page)
})

const card = (page: Page, letter: string) => page.getByRole('region', { name: `Site ${letter}`, exact: true })

test('a point can be named, and the name shows on its card and stays in the link', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  await expect(page.getByRole('heading', { name: /Sample site A/ })).toBeVisible()
  await page.getByRole('button', { name: 'Edit site A' }).click()
  await page.getByRole('textbox', { name: 'Site name' }).fill('Shackleton plan B')
  await page.getByRole('button', { name: /Apply site A/ }).click()
  await expect(page).toHaveURL(/n%3AShackleton\+plan\+B/)
  await expect(page.getByRole('heading', { name: /^Shackleton plan B/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: /^Shackleton plan B/ })).toBeVisible()
})

test('a new site can be added by latitude and longitude', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/')
  const a = card(page, 'A')
  await expect(a.getByRole('textbox', { name: 'Latitude' })).toBeVisible()
  await a.getByRole('textbox', { name: 'Latitude' }).fill('80° S')
  await a.getByRole('textbox', { name: 'Longitude' }).fill('0')
  await expect(a.getByText(/south-pole area, 84°S to 90°S/)).toBeVisible()
  await expect(a.getByRole('button', { name: /Apply site A/ })).toBeDisabled()

  await a.getByRole('textbox', { name: 'Latitude' }).fill('87.5 S')
  await a.getByRole('textbox', { name: 'Longitude' }).fill('45° E')
  await a.getByRole('button', { name: /Apply site A/ }).click()
  await expect(page).toHaveURL(/tk=pt_s87500_e045000/)
  await expect(page.getByRole('heading', { name: /^Site 87\.500°S 45\.000°E/ })).toBeVisible()
  await page.locator('.score-details > summary').first().click()
  // The new site gets a verdict like any catalog site.
  await expect(page.getByLabel(/^Sun: \d+%/)).toBeVisible()
})

test('clicking the map places a new point', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/')
  await expect(page.getByText('Click the map to add a site', { exact: false })).toBeVisible()
  await expect(page.locator('.placing .ol-viewport canvas').first()).toBeVisible()
  await expect(page.getByTestId('pin-sample_b')).toBeVisible()
  // With no site the map is centered on the pole, inside the custom-point area.
  const map = (await page.locator('.panel .polar-map').first().boundingBox())!
  await page.mouse.click(map.x + map.width / 2 - 40, map.y + map.height / 2 + 30)
  await expect(page).toHaveURL(/tk=pt_s\d+_[ew]\d+/)
  await expect(page.getByRole('heading', { name: /^Site \d/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit site A' })).toBeVisible()
})

test('a second click on the map adds another card with results', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/')
  const map = (await page.locator('.panel .polar-map').first().boundingBox())!
  await page.mouse.click(map.x + map.width / 2 - 40, map.y + map.height / 2 + 30)
  await expect(page).toHaveURL(/tk=pt_s/)
  await page.mouse.click(map.x + map.width / 2 + 60, map.y + map.height / 2 - 50)
  await expect(page.getByRole('region', { name: 'Site B' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Site A' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Apply site B' })).toHaveCount(0)
})

test('time on the Moon is set in days and hours, and updates the numbers once applied', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  await page.locator('.score-details > summary').first().click()
  const sun = page.getByLabel(/^Sun: \d+%/)
  await expect(sun).toBeVisible()
  const before = await sun.getAttribute('aria-label')

  await page.getByRole('button', { name: 'Edit site A' }).click()
  await page.getByRole('spinbutton', { name: 'Mission days' }).fill('3')
  await page.getByRole('spinbutton', { name: 'Mission hours' }).fill('6')
  await page.getByRole('spinbutton', { name: 'Mission hours' }).press('Enter')
  await page.getByRole('button', { name: /Apply site A/ }).click()
  await expect(page).toHaveURL(/%7E3\.25%7E/)
  await page.locator('.score-details > summary').click()
  await expect.poll(() => sun.getAttribute('aria-label')).not.toBe(before)

  await page.getByRole('button', { name: 'Edit site A' }).click()
  await expect(page.getByText('3 d 6 h on the Moon')).toBeVisible()
  await page.getByRole('combobox', { name: 'Mission length preset' }).selectOption('90')
  await page.getByRole('button', { name: /Apply site A/ }).click()
  await expect(page).toHaveURL(/%7E90%7E/)
})

test('panels and the site calculator can be resized by dragging', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=sample_a&tk=sample_b')
  await page.getByRole('button', { name: 'Ridge Graph' }).click()
  const first = page.getByRole('region', { name: 'Site A graph' })
  const startH = (await first.boundingBox())!.height
  const handle = page.getByRole('separator', { name: 'Resize graph A' })
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 150, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await first.boundingBox())!.height).toBeGreaterThan(startH + 20)

  const side = page.getByRole('complementary', { name: 'Site calculator' })
  const startW = (await side.boundingBox())!.width
  const divider = page.getByRole('separator', { name: 'Resize the site calculator' })
  const db = (await divider.boundingBox())!
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2)
  await page.mouse.down()
  await page.mouse.move(db.x - 120, db.y + db.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await side.boundingBox())!.width).toBeGreaterThan(startW + 100)
})

test('Freehand Select outlines an area on the grid and opens the best spots as points', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=~2027-03-01T00:00Z~29.53~2~n:Survey')
  await page.getByRole('button', { name: 'Manual Selection' }).click()
  const tool = page.getByRole('dialog', { name: 'Manual Selection' })
  await expect(tool).toBeVisible()
  await expect(page.getByRole('button', { name: 'Manual Selection', pressed: true })).toBeVisible()

  await expect(tool.getByText('Select at least 3 different grid points')).toBeVisible()
  await expect(tool.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  // The coarse grid keeps the outline under the 16-cell grading cap.
  await tool.getByLabel('Grid spacing').selectOption('10')
  // With no site the map is centered on the pole, well inside the custom-point area.
  const map = (await page.locator('.panel .polar-map').first().boundingBox())!
  // Draw below the region controls and inside the circle at the pole.
  const cx = map.x + map.width / 2
  const dialog = (await tool.boundingBox())!
  const cy = (dialog.y + dialog.height + map.y + map.height) / 2
  for (const [dx, dy] of [[-30, -17], [30, -17], [30, 17], [-30, 17]]) await page.mouse.click(cx + dx, cy + dy)
  await expect(tool.getByText(/4 selected/)).toBeVisible()

  await tool.getByRole('button', { name: 'Apply', exact: true }).click()
  const list = tool.getByRole('list', { name: 'Best areas' })
  await expect(list.getByRole('listitem').first()).toContainText('#1')
  await list.getByRole('checkbox').nth(1).check()
  await tool.getByRole('button', { name: 'Apply', exact: true }).click()

  await expect(card(page, 'B').getByRole('heading', { name: /Survey · area #1/ })).toBeVisible()
  await expect(card(page, 'C').getByRole('heading', { name: /Survey · area #2/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Ranked areas' })).toBeChecked()
  await expect(page.getByText('Area Score · Sample')).toBeVisible()
  const canvas = page.locator('.applied-area-polygons canvas')
  await expect.poll(() => canvas.evaluate((el) => {
    const layer = el as HTMLCanvasElement
    const pixels = layer.getContext('2d')!.getImageData(0, 0, layer.width, layer.height).data
    return pixels.some((value, i) => i % 4 === 3 && value > 0)
  })).toBe(true)
  await page.getByRole('radio', { name: 'Selected region' }).check()
  await expect(canvas).toBeVisible()
  await page.getByRole('radio', { name: 'None' }).check()
  await expect(canvas).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Relief' })).toBeChecked()
  await expect(page).toHaveURL(/tk=pt_s\d+_[ew]\d+/)
})

test('Apply refuses an outline with more grid cells than can be graded', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=~2027-03-01T00:00Z~29.53~2~n:Survey')
  await page.getByRole('button', { name: 'Manual Selection' }).click()
  const tool = page.getByRole('dialog', { name: 'Manual Selection' })
  await expect(tool).toBeVisible()
  await expect(tool.getByText('Select at least 3 different grid points')).toBeVisible()
  await expect(tool.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await tool.getByLabel('Grid spacing').selectOption('2')
  // With no site the map is centered on the pole, well inside the custom-point area.
  const map = (await page.locator('.panel .polar-map').first().boundingBox())!
  // Draw below the region controls and inside the circle at the pole.
  const cx = map.x + map.width / 2
  const dialog = (await tool.boundingBox())!
  const cy = (dialog.y + dialog.height + map.y + map.height) / 2
  for (const [dx, dy] of [[-50, -28], [50, -28], [50, 28], [-50, 28]]) await page.mouse.click(cx + dx, cy + dy)
  await expect(tool.getByText(/4 selected/)).toBeVisible()
  await tool.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(tool.getByRole('alert')).toContainText('Draw a smaller outline')
  await expect(tool.getByRole('list', { name: 'Best areas' })).toHaveCount(0)
})

test('calculator field help opens on click, closes with Escape, and leaves the draft intact', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/')
  const help = page.getByRole('button', { name: 'Help for latitude', exact: true })
  await help.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await help.click()
  await expect(page.getByRole('tooltip')).toContainText('84° S to 90° S')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(help).toBeFocused()
  await page.getByLabel('Site name', { exact: true }).fill('Survey')
  await page.getByRole('button', { name: 'Help for Earth stations' }).click()
  await page.getByRole('textbox', { name: 'Longitude', exact: true }).click()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(page.getByLabel('Site name', { exact: true })).toHaveValue('Survey')
})

async function openToolAndDraw(page: import('@playwright/test').Page, grid: string, half: [number, number]) {
  await page.goto('/?tk=~2027-03-01T00:00Z~29.53~2~n:Survey')
  await page.getByRole('button', { name: 'Manual Selection' }).click()
  const tool = page.getByRole('dialog', { name: 'Manual Selection' })
  await expect(tool).toBeVisible()
  await tool.getByLabel('Grid spacing').selectOption(grid)
  const map = (await page.locator('.panel .polar-map').first().boundingBox())!
  const cx = map.x + map.width / 2
  const dialog = (await tool.boundingBox())!
  const cy = (dialog.y + dialog.height + map.y + map.height) / 2
  const [hx, hy] = half
  for (const [dx, dy] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]) await page.mouse.click(cx + dx, cy + dy)
  await expect(tool.getByText(/4 selected/)).toBeVisible()
  return tool
}

test('the over-cap message goes away when the grid is changed', async ({ page, context }) => {
  await stubTiles(context)
  const tool = await openToolAndDraw(page, '2', [50, 28])
  await tool.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(tool.getByRole('alert')).toContainText('Draw a smaller outline')
  await tool.getByLabel('Grid spacing').selectOption('10')
  await expect(tool.getByRole('alert')).toHaveCount(0)
})

test('graded areas are cleared when the grading weights change', async ({ page, context }) => {
  await stubTiles(context)
  const tool = await openToolAndDraw(page, '10', [30, 17])
  await tool.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(tool.getByRole('list', { name: 'Best areas' })).toBeVisible()
  await tool.getByRole('button', { name: /Grading Weights/ }).click()
  const slider = page.getByRole('slider', { name: 'station contact' })
  await slider.fill('0.5')
  await slider.dispatchEvent('pointerup')
  await page.getByRole('dialog', { name: 'Grading Weights' }).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(tool.getByRole('button', { name: 'Apply', exact: true })).toBeVisible()
  await expect(tool.getByRole('list', { name: 'Best areas' })).toHaveCount(0)
})
