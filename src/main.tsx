import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// When a new service worker takes control (after a deploy), the page
// already in memory may still reference asset URLs the new worker's
// precache no longer has, producing a blank screen. Reload once so the
// browser re-fetches the new worker's internally-consistent app shell.
if ('serviceWorker' in navigator) {
  let reloadedForNewWorker = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForNewWorker) return
    reloadedForNewWorker = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
