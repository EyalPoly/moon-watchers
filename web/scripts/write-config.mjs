import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const committedPath = () => fileURLToPath(new URL('../public/config.json', import.meta.url))

export function writeConfig(outDir, mode, sourcePath = committedPath()) {
  const committed = JSON.parse(readFileSync(sourcePath, 'utf8'))
  let config = committed
  if (mode === 'product') {
    const sources = Object.fromEntries(Object.keys(committed.sources).map((key) => [key, 'sample']))
    config = { api_base: '', sources }
  } else if (mode !== 'integrated') {
    throw new Error(`unknown mode: ${mode}`)
  }
  writeFileSync(join(outDir, 'config.json'), JSON.stringify(config, null, 2) + '\n')
}

if (process.argv[1]?.endsWith('write-config.mjs')) {
  const [outDir, mode] = process.argv.slice(2)
  writeConfig(outDir, mode)
}
