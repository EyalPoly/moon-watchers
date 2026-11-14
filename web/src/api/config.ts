import { z } from 'zod'

const sourceMode = z.enum(['real', 'sample'])

// A real source needs an api_base: with an empty one the "real" request would go to the
// page's own origin, where the mock worker answers it with sample data.
const appConfigSchema = z
  .object({
    api_base: z.string(),
    sources: z.object({
      sites: sourceMode,
      horizon: sourceMode,
      summary: sourceMode,
      series: sourceMode.optional(),
    }),
  })
  .refine((c) => c.api_base !== '' || Object.values(c.sources).every((s) => s === 'sample'), {
    message: 'api_base is required when a source is real',
  })

export type AppConfig = z.infer<typeof appConfigSchema>
// meta follows sites. series follows summary unless sources.series says otherwise: it needs
// the ephemeris, which lands after the horizon masks and the summary.
// custom (POST /sites/custom) follows horizon: a custom point needs the terrain engine,
// so it goes real together with the horizon, not with the catalog.
export type SourceName = 'sites' | 'horizon' | 'summary' | 'meta' | 'series' | 'custom'

const FOLLOWS: Partial<Record<SourceName, 'sites' | 'horizon' | 'summary'>> = {
  meta: 'sites',
  custom: 'horizon',
}
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
  if (name === 'series') return config.sources.series ?? config.sources.summary
  const key = FOLLOWS[name] ?? (name as 'sites' | 'horizon' | 'summary')
  return config.sources[key]
}

export function anySample(config: AppConfig, search: string): boolean {
  return (['sites', 'horizon', 'summary', 'series'] as const).some(
    (name) => resolveSource(config, name, search) === 'sample',
  )
}
