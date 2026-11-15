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

// --- Guide v2: memory, app state, reference notes, asking back, score advice, region tool.

/** The guide panel, already connected (a key in this tab). */
async function openGuide(page: import('@playwright/test').Page, url: string) {
  await page.goto(url)
  await page.evaluate(() => sessionStorage.setItem('moon-watchers.gemini-key', 'k'))
  await page.reload()
  await page.getByRole('button', { name: 'Ask the AI guide' }).click()
  return page.getByRole('dialog', { name: 'AI Guide' })
}

async function sendTo(guide: import('@playwright/test').Locator, text: string) {
  await guide.getByRole('textbox', { name: 'Message to the AI guide' }).fill(text)
  await guide.getByRole('textbox', { name: 'Message to the AI guide' }).press('Enter')
}

const systemOf = (body: string) => JSON.parse(body).systemInstruction.parts[0].text as string
const turnsOf = (body: string) => (JSON.parse(body).contents as { role: string; parts: { text: string }[] }[]).map((c) => `${c.role}: ${c.parts[0].text}`)

const ONE_SITE = '/?tk=sample_b~2027-03-01T00:00Z~29.53~2~3'

test('the guide sees the open sites with their score breakdown and explains a low score', async ({ page, context }) => {
  const seen = await fakeGemini(context, [{ action: 'answer', reply: 'Site A scores low mostly because of station contact.' }])
  const guide = await openGuide(page, ONE_SITE)
  // Let the card's results load, so the guide is told about them.
  await expect(page.getByText(/Weighted Score \d+/).first()).toBeVisible()
  await sendTo(guide, 'Why is site A low?')
  await expect(guide.getByText('Site A scores low mostly because of station contact.')).toBeVisible()
  const system = systemOf(seen.at(-1)!.body)
  expect(system).toContain('A: Sample site B. catalog site sample_b')
  expect(system).toMatch(/Factors \(raw value, grade 0-1, weight share, points lost\): L sunlight/)
  expect(system).toContain('Warnings: ')
})

test('the guide reads reference notes when it needs them, then answers', async ({ page, context }) => {
  const seen = await fakeGemini(context, [
    { action: 'lookup', topics: ['south-pole-screen'], reply: 'Checking…' },
    { action: 'answer', reply: 'Ridge graph shows the highest ridge at each compass bearing.' },
  ])
  const guide = await openGuide(page, ONE_SITE)
  await sendTo(guide, 'What does the Ridge graph button do?')
  await expect(guide.getByText('Ridge graph shows the highest ridge at each compass bearing.')).toBeVisible()
  const posts = seen.filter((r) => r.body !== '')
  expect(posts).toHaveLength(2)
  expect(systemOf(posts[0].body)).not.toContain('=== south-pole-screen ===')
  expect(systemOf(posts[1].body)).toContain('=== south-pole-screen ===')
})

test('the guide asks back with options, and remembers the conversation', async ({ page, context }) => {
  const seen = await fakeGemini(context, [
    { action: 'ask', reply: 'Which month do you want to land?', options: ['March 2027', 'June 2027'] },
    { action: 'open', points: [{ site_id: 'sample_a' }], landing: '2027-06-01', reply: 'Opening.' },
  ])
  const guide = await openGuide(page, '/')
  await sendTo(guide, 'Land at sample A')
  await expect(guide.getByText('Which month do you want to land?')).toBeVisible()
  await guide.getByRole('button', { name: 'June 2027' }).click()
  await expect(guide.getByText(/Opened site A Sample site A\./)).toBeVisible()
  await expect(page).toHaveURL(/tk=sample_a%7E2027-06-01T00%3A00Z/)
  const posts = seen.filter((r) => r.body !== '')
  expect(turnsOf(posts[1].body)).toEqual(['user: Land at sample A', 'model: Which month do you want to land?', 'user: June 2027'])
})

test('in Advisor mode the guide suggests weights and applies them only on Apply', async ({ page, context }) => {
  await fakeGemini(context, [{ action: 'set_score', weights: { L: 0.15, C: 0.45, DK: 0.1, OT: 0.15, LS: 0.05, S: 0.1, D: 0 }, reply: 'More weight on contact.' }])
  const guide = await openGuide(page, ONE_SITE)
  await expect(guide.getByRole('button', { name: 'Advisor' })).toHaveAttribute('aria-pressed', 'true')
  await sendTo(guide, 'I care most about communication')
  await expect(guide.getByText(/Suggested: sunlight 0\.25 → 0\.15, station contact 0\.25 → 0\.45/)).toBeVisible()
  await expect(page).not.toHaveURL(/[?&]w=/)
  await guide.getByRole('button', { name: 'Apply weights' }).click()
  await expect(page).toHaveURL(/[?&]w=0\.15,0\.45,0\.1,0\.15,0\.05,0\.1,0/)
  await expect(guide.getByText('Applied. Back undoes it.')).toBeVisible()
  await page.goBack()
  await expect(page).not.toHaveURL(/[?&]w=/)
})

test('in Direct mode the guide applies a preset at once', async ({ page, context }) => {
  await fakeGemini(context, [{ action: 'set_score', preset: 'sunlight_first', reply: 'Sunlight first.' }])
  const guide = await openGuide(page, ONE_SITE)
  await guide.getByRole('button', { name: 'Direct' }).click()
  await sendTo(guide, 'Power matters most')
  await expect(guide.getByText(/Applied: Sunlight first preset: sunlight 0\.25 → 0\.60/)).toBeVisible()
  await expect(page).toHaveURL(/[?&]w=0\.6,0\.2,0,0,0,0\.1,0\.1/)
})

test('the guide opens Manual Selection and reports the best areas once the outline has 3 points', async ({ page, context }) => {
  await fakeGemini(context, [{ action: 'open_region', reply: 'Click three or more grid points around the area.' }])
  const guide = await openGuide(page, '/')
  await sendTo(guide, 'Help me find the best area')
  const tool = page.getByRole('dialog', { name: 'Manual Selection' })
  await expect(tool).toBeVisible()
  await expect(tool.getByText('The AI guide finds the best areas once the outline has 3 points.')).toBeVisible()
  // Close the guide so it doesn't cover the map, outline a square, and reopen it.
  await guide.getByRole('button', { name: 'Close the AI guide' }).click()
  // The tool's panel sits at the map's top right and is taller when the guide opened it,
  // so outline a square in the free part of the map to its left (font widths differ by OS).
  const map = (await page.locator('.panel .polar-map').first().boundingBox())!
  const panel = (await tool.boundingBox())!
  const freeRight = Math.min(panel.x, map.x + map.width) - 16
  const half = Math.min(45, (freeRight - map.x - 32) / 2)
  const cx = (map.x + 16 + freeRight) / 2
  const cy = map.y + map.height / 2
  const corners = [[-half, -half], [half, -half], [half, half]]
  corners.forEach(([dx]) => expect(cx + dx, 'outline stays left of the tool panel').toBeLessThan(panel.x))
  for (const [i, [dx, dy]] of corners.entries()) {
    await page.mouse.click(cx + dx, cy + dy)
    await expect(tool.getByText(new RegExp(`^${i + 1} selected`))).toBeVisible()
  }
  await expect(tool.getByRole('list', { name: 'Best areas' })).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: 'Ask the AI guide' }).click()
  await expect(guide.getByText(/^Best areas in your outline \(5 km grid, best first\): #1 /)).toBeVisible()
})
