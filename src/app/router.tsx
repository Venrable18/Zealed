import { createBrowserRouter } from 'react-router'
import { RootLayout } from './RootLayout.tsx'
import { Components } from './routes/Components.tsx'
import { Dashboard } from './routes/Dashboard.tsx'
import { FeaturePage } from './routes/FeaturePage.tsx'
import { Home } from './routes/Home.tsx'
import { NotFound } from './routes/NotFound.tsx'
import { Settings } from './routes/Settings.tsx'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'legacy', element: <FeaturePage path="/legacy" /> },
      { path: 'blind-pot', element: <FeaturePage path="/blind-pot" /> },
      { path: 'unsigned', element: <FeaturePage path="/unsigned" /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'settings', element: <Settings /> },
      { path: 'components', element: <Components /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
