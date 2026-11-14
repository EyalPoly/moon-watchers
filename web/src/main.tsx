import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { anySample, loadConfig } from './api/config'

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
      <App config={config} />
    </StrictMode>,
  )
}

void start()
