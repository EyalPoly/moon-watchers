import { expect, test, type BrowserContext } from '@playwright/test'
import { pinSampleConfig, stubTiles } from './helpers'

// Gemini is faked: no test needs a real key. context.route, not page.route, because with
// the mock service worker active the request leaves from the worker.
async function fakeGemini(context: BrowserContext, answers: object[], keyOk = true) {
  const seen: { key: string | null; body: string }[] = []
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST' } })
    }
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }
    seen.push({ key: req.headers()['x-goog-api-key'] ?? null, body: req.postData() ?? '' })
    if (!keyOk) return route.fulfill({ status: 400, headers, body: JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid.' } }) })
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers, body: JSON.stringify({ name: 'models/x' }) })
    const next = answers.shift() ?? { action: 'none', reply: 'No more answers.' }
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(next) }] } }] }) })
  })
  return seen
}

test.beforeEach(async ({ page, context }) => {
  await pinSampleConfig(page)
  await stubTiles(context)
})

test('the guide asks for a Gemini key the first time, then opens a named site', async ({ page, context }) => {
  const seen = await fakeGemini(context, [
    { action: 'open', points: [{ site_id: 'sample_b' }], days: 14, station_id: 'madrid', name: 'Crater plan', reply: 'Opening Sample site B.' },
  ])
  await page.goto('/')
  await page.getByRole('button', { name: 'Ask the AI guide' }).click()
  const guide = page.getByRole('dialog', { name: 'AI Guide' })
  await expect(guide.getByRole('heading', { name: 'Connect Gemini' })).toBeVisible()

  await guide.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123')
  await guide.getByRole('button', { name: 'Connect' }).click()
  await expect(guide.getByRole('textbox', { name: 'Message to the AI guide' })).toBeVisible()

  await guide.getByRole('textbox', { name: 'Message to the AI guide' }).fill('Two weeks at sample B, talking to Madrid')
  await guide.getByRole('textbox', { name: 'Message to the AI guide' }).press('Enter')
  await expect(guide.getByText('Opened site A Sample site B.')).toBeVisible()
  await expect(guide.getByText(/14 days on the Moon/)).toBeVisible()

  await expect(page).toHaveURL(/tk=sample_b%7E2027-03-01T00%3A00Z%7E14%7E2%7E3/)
  await expect(page.getByRole('region', { name: 'Site A' }).getByText('Crater plan').first()).toBeVisible()
  expect(seen.every((r) => r.key === 'test-key-123')).toBe(true)
  // The key is kept for this tab only unless "Remember on this device" is ticked.
  expect(await page.evaluate(() => localStorage.getItem('moon-watchers.gemini-key'))).toBeNull()
  expect(page.url()).not.toContain('test-key-123')
})

test('a request with no place opens every catalog site with the mission settings', async ({ page, context }) => {
  await fakeGemini(context, [{ action: 'explore', days: 120, landing: '2027-03-01', reply: 'Opening all sites.' }])
  await page.goto('/?tk=sample_a~2027-03-01T00:00Z~29.53~2~3')
  await page.evaluate(() => sessionStorage.setItem('moon-watchers.gemini-key', 'k'))
  await page.reload()
  await page.getByRole('button', { name: 'Ask the AI guide' }).click()
  const guide = page.getByRole('dialog', { name: 'AI Guide' })
  await guide.getByRole('button', { name: /4-month mission/ }).click()
  await expect(guide.getByText(/Opened 3 sites: B Sample site A, C Sample site B, D Sample site C\./)).toBeVisible()
  // The first new site (B) opens; the calculator shows three sites per page.
  await expect(page.getByRole('region', { name: 'Site B' })).toBeVisible()
  expect(new URL(page.url()).searchParams.getAll('tk')).toHaveLength(4)
})

test('a rejected key says so and stays on the key form', async ({ page, context }) => {
  await fakeGemini(context, [], false)
  await page.goto('/')
  await page.getByRole('button', { name: 'Ask the AI guide' }).click()
  const guide = page.getByRole('dialog', { name: 'AI Guide' })
  await guide.getByRole('textbox', { name: 'Gemini API key' }).fill('wrong')
  await guide.getByRole('button', { name: 'Connect' }).click()
  await expect(guide.getByRole('alert')).toHaveText('Gemini did not accept this API key.')
  await expect(guide.getByRole('heading', { name: 'Connect Gemini' })).toBeVisible()
})

test('the floating guide can move and minimize without losing a conversation draft', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('moon-watchers.gemini-key', 'sample-key'))
  await page.goto('/?site=sample_a')
  const launcher = page.getByRole('button', { name: 'Ask the AI guide' })
  await launcher.click()
  const guide = page.getByRole('dialog', { name: 'AI Guide' })
  const message = guide.getByRole('textbox', { name: 'Message to the AI guide' })
  await message.fill('Compare the landing sites')
  const before = (await guide.boundingBox())!
  const move = guide.getByRole('button', { name: 'Move the AI guide' })
  const handle = (await move.boundingBox())!
  await page.mouse.move(handle.x + 12, handle.y + 12)
  await page.mouse.down()
  await page.mouse.move(handle.x - 106, handle.y + 42, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => (await guide.boundingBox())!.x).toBeLessThan(before.x - 100)
  await move.press('ArrowLeft')
  await expect.poll(async () => (await guide.boundingBox())!.x).toBeLessThan(before.x - 125)
  await guide.getByRole('button', { name: 'Minimize the AI guide' }).click()
  await expect(message).toBeHidden()
  expect((await guide.boundingBox())!.height).toBeLessThan(56)
  await guide.getByRole('button', { name: 'Restore the AI guide' }).click()
  await expect(message).toHaveValue('Compare the landing sites')
  await guide.getByRole('button', { name: 'Close the AI guide' }).click()
  await expect(guide).toHaveCount(0)
  await expect(launcher).toBeFocused()
})
