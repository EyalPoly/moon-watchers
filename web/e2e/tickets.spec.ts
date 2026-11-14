import { expect, test } from '@playwright/test'
import { stubTiles, pinSampleConfig } from './helpers'

test.beforeEach(async ({ page }) => {
  await pinSampleConfig(page)
})

const SITES = ['sample_a', 'sample_b', 'sample_c']
const many = (n: number) => '/?' + Array.from({ length: n }, (_, i) => `tk=${SITES[i % 3]}`).join('&')
const panels = (page: import('@playwright/test').Page) => page.getByRole('region', { name: /^Ticket \d+ view$/ })

test('there is no ticket limit, and with many tickets the panel column scrolls', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto(many(5))
  await expect(panels(page)).toHaveCount(5)
  await page.getByRole('button', { name: '+ New ticket' }).click()
  await expect(panels(page)).toHaveCount(6)

  // Scrolling over a map moves the column instead of zooming the map.
  const main = page.getByRole('main', { name: 'South pole' })
  await page.locator('.panel .polar-map').first().hover()
  await page.mouse.wheel(0, 600)
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect(page.getByText('Ctrl + scroll to zoom the map')).toBeVisible()

  // Expand shows a single panel, full size; Show all brings the rest back.
  await page.getByRole('region', { name: 'Ticket 2 view' }).getByRole('button', { name: 'Expand' }).click()
  await expect(panels(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Show all', pressed: true }).click()
  await expect(panels(page)).toHaveCount(6)
})

test('the user picks which tickets show in the main area', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto(many(3))
  await page.getByRole('checkbox', { name: 'Show Ticket 2 in the main area' }).uncheck()
  await expect(page.getByRole('region', { name: 'Ticket 2 view' })).toHaveCount(0)
  await expect(page).toHaveURL(/sample_b[^&]*%7Eh/)
  await page.getByRole('button', { name: 'Hide all' }).click()
  await expect(page.getByText('No tickets are shown here.')).toBeVisible()
  await page.getByRole('button', { name: 'Show all tickets' }).click()
  await expect(panels(page)).toHaveCount(3)
})

test('each ticket gets a rank from the ranking function, and the best has green side lines', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto(many(3))
  await expect(page.getByLabel(/^Rank \d of 3, grade \d+$/)).toHaveCount(3)
  const best = page.locator('.ticket.ticket-best')
  await expect(best).toHaveCount(1)
  await expect(best.getByLabel(/^Rank 1 of 3/)).toBeVisible()
  await expect(best).toHaveCSS('border-right-color', 'rgb(74, 222, 128)')
  await expect(best).toHaveCSS('border-left-color', 'rgb(74, 222, 128)')
  await expect(page.getByText(/Ranking updated \d\d:\d\d:\d\d/)).toBeVisible()

  await page.getByRole('button', { name: 'Sort by rank' }).click()
  await expect(page.locator('.ticket').first().getByLabel(/^Rank 1 of 3/)).toBeVisible()
})

test('a custom Earth station by lat/lon shows on the sky graph', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=sample_a~2027-03-01T00:00Z~29.53~2~g')
  await expect(page.locator('.sky-caption').getByText('Contact with all DSN sites')).toBeVisible()
  await page.getByRole('combobox', { name: 'Earth station' }).selectOption('custom')
  await page.getByRole('textbox', { name: 'Station latitude' }).fill('31.25')
  await page.getByRole('textbox', { name: 'Station longitude' }).fill('34.79')
  await page.getByRole('button', { name: 'Use' }).click()
  await expect(page).toHaveURL(/s%3A%4031\.25%2C34\.79/)
  await expect(page.locator('.sky-caption').getByText('Contact with 31.25°, 34.79°')).toBeVisible()
  await expect(page.locator('.sky-contact-no-station').first()).toBeAttached()

  await page.getByRole('combobox', { name: 'Earth station' }).selectOption('canberra')
  await expect(page.locator('.sky-caption').getByText('Contact with Canberra (Australia)')).toBeVisible()
})

test('the sky graph shows azimuth degrees with compass points', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?tk=sample_a~2027-03-01T00:00Z~29.53~2~g')
  const degrees = page.locator('.sky-view .sky-degrees')
  const compass = page.locator('.sky-view .sky-compass')
  for (const label of ['0°', '90°', '180°', '270°']) {
    await expect(degrees.getByText(label, { exact: true })).toHaveCount(1)
  }
  for (const label of ['N', 'E', 'S', 'W']) {
    await expect(compass.getByText(label, { exact: true })).toBeAttached()
  }
})
