import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { applyTheme } from './lib/theme'

// Clickjacking guard: CSP frame-ancestors cannot be set via a <meta> tag on GitHub Pages,
// so refuse to render inside a frame.
const framed = (() => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
})()

applyTheme()

if (framed) {
  document.body.textContent = 'Havenwear Care cannot be displayed inside another site.'
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
