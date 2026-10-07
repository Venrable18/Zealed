import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from './app/router.tsx'
import { applyDemoParam } from './app/settingsStore.ts'
import './index.css'

applyDemoParam(window.location.search)

const root = document.getElementById('root')
if (root === null) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
