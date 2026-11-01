import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App, createQueryClient } from '@/app/App'
import { ConfigError, getAppConfig } from '@/shared/config/runtime-config'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemen #root tidak ditemukan di index.html')

function renderFatal(message: string): void {
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.style.cssText = 'font-family:system-ui;max-width:32rem;margin:4rem auto;padding:1.5rem;border:1px solid #fecaca;background:#fef2f2;border-radius:.75rem;color:#7f1d1d'
  const title = document.createElement('strong')
  title.textContent = 'Konfigurasi aplikasi tidak valid'
  const body = document.createElement('p')
  body.textContent = message
  box.append(title, body)
  container!.replaceChildren(box)
}

try {
  getAppConfig() // fail fast on a bad Helm value instead of failing on the first request
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        <App queryClient={createQueryClient()} />
      </BrowserRouter>
    </StrictMode>,
  )
} catch (error) {
  renderFatal(error instanceof ConfigError ? error.message : 'Aplikasi gagal dimulai. Hubungi administrator.')
  if (!(error instanceof ConfigError)) console.error(error)
}
