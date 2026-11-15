import { expect, test } from '@playwright/test'
import { stubTiles } from './helpers'

test('Orbit rotates and zooms independently of its UTC lighting, including in software', async ({ page, context }) => {
  // Exercise the same interaction path on machines without WebGL2.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      return kind === 'webgl2' ? null : Reflect.apply(original, this, [kind, ...args])
    } as typeof original
  })
  await stubTiles(context)
  await page.goto('/?data=sample&screen=orbit')
  await expect(page.getByRole('button', { name: 'Orbit', exact: true })).toHaveAttribute('aria-current', 'page')
  const globe = page.locator('.moon-orbit-viewer')
  await expect(globe).toHaveAttribute('data-quality', 'full')
  await expect(globe).toHaveAttribute('data-renderer', 'software')
  const pole = page.getByRole('button', { name: 'South pole', exact: true })
  await expect(pole).toBeVisible()
  const pinPosition = () => pole.getAttribute('style')
  const initial = await pinPosition()
  const pixels = () => globe.locator('canvas').evaluate(canvas => {
    const sample = document.createElement('canvas')
    sample.width = sample.height = 24
    const ctx = sample.getContext('2d')!
    ctx.drawImage(canvas as HTMLCanvasElement, 0, 0, 24, 24)
    return Array.from(ctx.getImageData(0, 0, 24, 24).data).reduce((hash, v) => (hash * 31 + v) >>> 0, 0)
  })
  const before = await pixels()
  await page.getByLabel('Orbit date', { exact: true }).fill('2026-10-22')
  await expect.poll(pixels).not.toBe(before)
  expect(await pinPosition()).toBe(initial)
  await page.getByRole('group', { name: /Orbit around the Moon/ }).press('ArrowLeft')
  await expect.poll(pinPosition).not.toBe(initial)
  const rotated = await pinPosition()
  await page.getByRole('button', { name: 'Zoom in on the Moon' }).click()
  await expect.poll(pinPosition).not.toBe(rotated)
  await page.getByRole('button', { name: 'Reset orbital view' }).click()
  await expect.poll(pinPosition).toBe(initial)
  await page.getByLabel('Hour of the selected UTC day').focus()
  await page.getByLabel('Hour of the selected UTC day').press('ArrowRight')
  await expect(page.getByLabel('Orbit time (UTC)')).toHaveValue('08:40')
  await page.reload()
  await expect(page.getByLabel('Orbit time (UTC)')).toHaveValue('08:40')
})

test('Orbit keeps calculator plans and opens a selected site at the chosen time', async ({ page, context }) => {
  await stubTiles(context)
  await page.goto('/?data=sample&tk=sample_a~2027-03-01T00:00Z~29.53~2~3~g')
  const startingLink = page.url()
  await page.getByRole('button', { name: 'Orbit', exact: true }).click()
  await expect(page.getByLabel('Orbit date', { exact: true })).toHaveValue('2027-03-01')
  await page.getByRole('button', { name: 'Site Calculator', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ridge graph' })).toHaveAttribute('aria-pressed', 'true')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Lunar overview' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(startingLink)
  await page.getByRole('button', { name: 'Orbit', exact: true }).click()
  await page.getByLabel('Orbit date', { exact: true }).fill('2027-04-03')
  await page.getByText('Layers & map key', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Locate a landing site' }).selectOption('sample_b')
  await page.getByRole('button', { name: 'Explore South Pole' }).click()
  await expect(page.getByRole('main', { name: 'South pole' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Map view' })).toHaveAttribute('aria-pressed', 'true')
  const tickets = new URL(page.url()).searchParams.getAll('tk')
  expect(tickets[0]).toContain('sample_a~2027-03-01T00:00Z')
  expect(tickets[1]).toContain('sample_b~2027-04-03T00:00Z')
})
