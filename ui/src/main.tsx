import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/plus-jakarta-sans/latin-400.css'
import '@fontsource/plus-jakarta-sans/latin-500.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-800.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import './styles/base.css'
import './styles/index.css'
import App from './App'
import { Board } from './board/Board'
import { isEnvBrowser } from './lib/nui'

// One bundle, two pages: ?board=1 is the studio's brand wall (a DUI texture), anything else is the NUI page
const q = new URLSearchParams(location.search)
const root = createRoot(document.getElementById('root')!)

if (q.get('board')) {
  document.documentElement.setAttribute('data-board', 'true')
  root.render(<StrictMode><Board /></StrictMode>)
} else if (import.meta.env.DEV && isEnvBrowser) {
  const Dev = lazy(() => import('./dev/Dev'))
  document.documentElement.setAttribute('data-dev-mode', 'true')
  root.render(<StrictMode><Suspense fallback={null}><Dev /></Suspense></StrictMode>)
} else {
  root.render(<StrictMode><App /></StrictMode>)
}
