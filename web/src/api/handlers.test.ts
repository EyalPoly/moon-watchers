import { setupServer } from 'msw/node'
import { afterAll, beforeAll, expect, test } from 'vitest'
import health from '@samples/health.json'
import meta from '@samples/meta.json'
import { buildHandlers } from './mocks/handlers'

const server = setupServer(...buildHandlers({ meta, health }))

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterAll(() => server.close())

test('meta ignores the v query parameter', async () => {
  const a = await (await fetch('http://localhost/api/v1/meta?v=abc')).json()
  const b = await (await fetch('http://localhost/api/v1/meta?v=zzz')).json()
  expect(a).toEqual(b)
  expect(a).toEqual(meta)
})

test('health returns the health sample', async () => {
  const body = await (await fetch('http://localhost/api/v1/health')).json()
  expect(body).toEqual(health)
})
