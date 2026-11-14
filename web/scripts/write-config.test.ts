import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
// @ts-expect-error plain ESM script without type declarations
import { writeConfig } from './write-config.mjs'

const committed = {
  api_base: 'https://api.example.org',
  sources: { sites: 'real', horizon: 'real', summary: 'sample' },
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
  const source = join(dir, 'committed.json')
  writeFileSync(source, JSON.stringify(committed))
  return { dir, source }
}

test('product mode forces every source to sample', () => {
  const { dir, source } = setup()
  writeConfig(dir, 'product', source)
  const out = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
  expect(out.api_base).toBe('')
  expect(Object.values(out.sources).every((s) => s === 'sample')).toBe(true)
})

test('integrated mode copies the committed config unchanged', () => {
  const { dir, source } = setup()
  writeConfig(dir, 'integrated', source)
  expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))).toEqual(committed)
})
