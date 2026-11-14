import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './ui/mission.css'
import './ui/screen2.css'
import './ui/tools.css'
import './ui/south-pole.css'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { anySample, loadConfig } from './api/config'

const queryClient = new QueryClient()

async function start() {
  const config = await loadConfig()
  if (anySample(config, window.location.search)) {
    const { worker } = await import('./api/mocks/browser')
    await worker.start({
      onUnhandledFrame: 'bypass',
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    })
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App config={config} />
      </QueryClientProvider>
    </StrictMode>,
  )
}

void start()
