import { z } from 'zod'

const sourceMode = z.enum(['real', 'sample'])

const appConfigSchema = z.object({
  api_base: z.string(),
  sources: z.object({
    sites: sourceMode,
    horizon: sourceMode,
    summary: sourceMode,
  }),
})

export type AppConfig = z.infer<typeof appConfigSchema>
export type SourceName = 'sites' | 'horizon' | 'summary' | 'meta'
export type SourceMode = z.infer<typeof sourceMode>

const ALL_SAMPLE: AppConfig = {
  api_base: '',
  sources: { sites: 'sample', horizon: 'sample', summary: 'sample' },
}

export async function loadConfig(url = `${import.meta.env.BASE_URL}config.json`): Promise<AppConfig> {
  try {
    const response = await fetch(url)
    if (!response.ok) return ALL_SAMPLE
    const parsed = appConfigSchema.safeParse(await response.json())
    return parsed.success ? parsed.data : ALL_SAMPLE
  } catch {
    return ALL_SAMPLE
  }
}

function forcedSample(search: string): boolean {
  return new URLSearchParams(search).get('data') === 'sample'
}

export function resolveSource(config: AppConfig, name: SourceName, search: string): SourceMode {
  if (forcedSample(search)) return 'sample'
  return config.sources[name === 'meta' ? 'sites' : name]
}

export function anySample(config: AppConfig, search: string): boolean {
  return (['sites', 'horizon', 'summary'] as const).some(
    (name) => resolveSource(config, name, search) === 'sample',
  )
}
