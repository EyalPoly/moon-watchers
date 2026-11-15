import { expect, test, type Page } from '@playwright/test'
import { pinSampleConfig, stubTiles } from './helpers'

test.beforeEach(async ({ page }) => {
  await pinSampleConfig(page)
})

const SITES = ['sample_a', 'sample_b', 'sample_c']
const many = (n: number) => '/?' + Array.from({ length: n }, (_, i) => `tk=${SITES[i % 3]}`).join('&')
const graphs = (page: Page) => page.getByRole('region', { name: /^Site [A-Z]+ graph$/ })
const key = (page: Page) => page.locator('.sky-key > summary')
const edit = (page: Page) => page.getByRole('button', { name: 'Edit input' }).click()
const picker = (page: Page) => page.locator('.station-menu > summary')

test('all sites share one map, and additional sites stay reachable in pages of three', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto(many(5))
  await expect(page.getByRole('region', { name: 'Landing sites map' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Focus site/ })).toHaveCount(5)
  await page.getByRole('button', { name: '+ Add site' }).click()
  await expect(page.getByRole('region', { name: 'Site F', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Previous' }).click()
  await page.getByRole('button', { name: 'Ridge graph' }).click()
  await expect(graphs(page)).toHaveCount(3)
  await page.getByRole('button', { name: 'Expand graph B' }).click()
  await expect(graphs(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Show all graphs' }).click()
  await expect(graphs(page)).toHaveCount(3)
  await expect(page.getByRole('img', { name: /^Sky view at/ })).toHaveCount(3)
})

test('the user picks which points show in the explorer', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto(many(3))
  await page.getByRole('checkbox', { name: 'Show site B in the explorer' }).uncheck()
  await expect(page.getByRole('button', { name: 'Focus site B' })).toHaveCount(0)
  await expect(page).toHaveURL(/sample_b[^&]*%7Eh/)
  await page.getByRole('button', { name: 'Hide all' }).click()
  await expect(page.getByText('No sites are shown in the explorer.')).toBeVisible()
  await page.getByRole('button', { name: 'Show all sites' }).click()
  await expect(page.getByRole('button', { name: /^Focus site/ })).toHaveCount(3)
})

test('each point gets a rank from the ranking function, and the best has green side lines', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto(many(3))
  await expect(page.getByLabel(/^Rank \d of 3, grade \d+$/)).toHaveCount(3)
  const best = page.locator('.point.point-best')
  await expect(best).toHaveCount(1)
  await expect(best.getByLabel(/^Rank 1 of 3/)).toBeVisible()
  await expect(best).toHaveCSS('border-right-color', 'rgb(95, 212, 154)')
  await expect(best).toHaveCSS('border-left-color', 'rgb(95, 212, 154)')
  await expect(page.getByText(/Ranking updated \d\d:\d\d:\d\d/)).toBeVisible()

  await page.getByRole('button', { name: 'Sort by rank' }).click()
  await expect(page.locator('.point').first().getByLabel(/^Rank 1 of 3/)).toBeVisible()
})

test('a custom Earth station by lat/lon shows on the ridge graph once applied', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=sample_a~2027-03-01T00:00Z~29.53~2~3~g')
  await key(page).click()
  const legend = page.locator('.sky-caption')
  await expect(legend.getByText(/Contact with Houston \(demonstration location/)).toBeVisible()
  await edit(page)
  await picker(page).click()
  await page.getByRole('button', { name: 'Custom location…' }).click()
  await page.getByRole('textbox', { name: 'Station latitude' }).fill('31.25')
  await page.getByRole('textbox', { name: 'Station longitude' }).fill('34.79')
  await page.getByRole('button', { name: 'Use' }).click()
  // "Use" only fills the card; the point changes when it is applied.
  await expect(legend.getByText(/Contact with Houston/)).toBeVisible()

  await page.getByRole('button', { name: /Apply site A/ }).click()
  await expect(page).toHaveURL(/s%3A31\.25%2C34\.79%2C0%2C0/)
  await expect(legend.getByText('Contact with 31.25°, 34.79°')).toBeVisible()
  await expect(page.locator('.sky-contact-no-station').first()).toBeAttached()

  await edit(page)
  await picker(page).click()
  await page.getByRole('checkbox', { name: 'Canberra (Australia)' }).check()
  await page.getByRole('button', { name: /Apply site A/ }).click()
  await expect(legend.getByText('Contact with Canberra (Australia)')).toBeVisible()
})

test('an old ticket link with one mast height still opens, with the default antenna and Houston', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=sample_a~2027-03-01T00:00Z~29.53~2~g')
  await key(page).click()
  await expect(page.locator('.sky-caption').getByText(/Contact with Houston/)).toBeVisible()
  await edit(page)
  await expect(page.getByRole('slider', { name: 'Antenna height in meters' })).toHaveValue('3')
})

test('panel and antenna heights are typed in centimetres and show a second skyline', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=sample_a~2027-03-01T00:00Z~29.53~2~3~g')
  await expect(page.locator('.sky-terrain-edge-antenna')).toBeAttached()
  await edit(page)
  const antenna = page.getByRole('textbox', { name: 'Antenna height in meters, exact value' })
  await antenna.fill('2.55')
  await antenna.press('Enter')
  await page.getByRole('button', { name: /Apply site A/ }).click()
  await expect(page).toHaveURL(/29\.53%7E2%7E2\.55/)
  await edit(page)
  await antenna.fill('2.555')
  await expect(page.getByText('1 to 10 m, at most two decimals.')).toBeVisible()
  await antenna.fill('2')
  await antenna.press('Enter')
  await page.getByRole('button', { name: /Apply site A/ }).click()
  await expect(page.locator('.sky-terrain-edge-antenna')).toHaveCount(0)
})

test('the ridge graph runs from north through south back to north', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=sample_a~2027-03-01T00:00Z~29.53~2~3~g')
  const degrees = page.locator('.sky-view .sky-degrees')
  const compass = page.locator('.sky-view .sky-compass')
  await expect(degrees.getByText('000°', { exact: true })).toHaveCount(2)
  for (const label of ['090°', '180°', '270°']) {
    await expect(degrees.getByText(label, { exact: true })).toHaveCount(1)
  }
  await expect(degrees.first()).toHaveText('000°')
  await expect(degrees.last()).toHaveText('000°')
  for (const label of ['E', 'S', 'W']) {
    await expect(compass.getByText(label, { exact: true })).toBeAttached()
  }
})


test('station groups and layer radios keep their independent selection rules', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?site=sample_a')
  const layers = page.getByRole('radiogroup', { name: 'VISIBLE LAYERS' })
  await expect(layers.getByRole('radio')).toHaveCount(5)
  await layers.getByRole('radio', { name: 'Dust' }).check()
  await expect(layers.getByRole('radio', { checked: true })).toHaveCount(1)
  await expect(page.getByText('Dust map data is not available yet.')).toBeVisible()
  await layers.getByRole('radio', { name: 'Relief' }).check()
  await edit(page)
  await picker(page).click()
  const menu = page.locator('.station-menu')
  await expect(menu.getByRole('checkbox')).toHaveCount(8)
  await menu.getByRole('checkbox', { name: 'NASA Deep Space Network' }).check()
  await menu.getByRole('checkbox', { name: 'Madrid (Spain)' }).uncheck()
  await expect(menu.getByRole('checkbox', { name: 'NASA Deep Space Network' })).toHaveJSProperty('indeterminate', true)
  await menu.getByRole('checkbox', { name: 'ESA ESTRACK' }).check()
  await page.getByRole('button', { name: 'Apply site A' }).click()
  const result = page.getByRole('combobox', { name: 'Results for station' })
  await expect(result.locator('option')).toHaveCount(5)
  await result.selectOption({ label: 'Cebreros (Spain)' })
  await page.reload()
  await expect(result.locator('option:checked')).toHaveText('Cebreros (Spain)')
  await edit(page)
  await expect(page.getByText('5 stations selected', { exact: true })).toBeVisible()
})

test('three result cards and ridge plots fit a laptop and reflow on a phone', async ({ page, context }) => {
  await stubTiles(context)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(many(3))
  await page.getByRole('button', { name: 'Ridge graph' }).click()
  await expect(page.getByRole('img', { name: /^Sky view at/ })).toHaveCount(3)
  await page.getByRole('button', { name: 'Live conditions', exact: true }).click()
  await expect.poll(() => page.locator('.tickets').evaluate((el) =>
    el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  // The whole-mission results (score box, warnings, metrics) are taller than the live view:
  // the cards may scroll down, but never sideways.
  await page.getByRole('button', { name: 'Whole mission', exact: true }).click()
  await expect.poll(() => page.locator('.tickets').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  for (const plot of await page.locator('.panel-graph').all()) {
    expect(await plot.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByRole('region', { name: 'Site C', exact: true })).toBeVisible()
  const top = await page.getByRole('region', { name: 'Site A', exact: true }).boundingBox()
  const bottom = await page.getByRole('region', { name: 'Site C', exact: true }).boundingBox()
  expect(bottom!.y).toBeGreaterThan(top!.y + top!.height)
})
