import { useEffect, useState } from 'react'
import { createApi } from './api/client'
import { anySample, type AppConfig } from './api/config'
import type { Meta } from './api/types'
import { PolarMap } from './map/PolarMap'
import { SampleBanner } from './ui/SampleBanner'

export default function App({ config }: { config: AppConfig }) {
  const search = window.location.search
  const [meta, setMeta] = useState<Meta | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    createApi(config, search)
      .getMeta()
      .then(setMeta)
      .catch(() => setFailed(true))
  }, [config, search])

  const region = meta?.regions[0]
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <SampleBanner visible={anySample(config, search)} />
      {region ? <PolarMap region={region} /> : <p>{failed ? 'Server unavailable' : 'Loading…'}</p>}
    </div>
  )
}
