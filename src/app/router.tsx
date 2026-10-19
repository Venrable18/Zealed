import { createBrowserRouter } from 'react-router'
import { RootLayout } from './RootLayout.tsx'
import { BlindPot } from './routes/BlindPot.tsx'
import { Give } from './routes/Give.tsx'
import { Components } from './routes/Components.tsx'
import { Dashboard } from './routes/Dashboard.tsx'
import { Home } from './routes/Home.tsx'
import { NotFound } from './routes/NotFound.tsx'
import { PotPage } from './routes/PotPage.tsx'
import { Unsigned } from './routes/Unsigned.tsx'
import { Send } from './routes/Send.tsx'
import { Settings } from './routes/Settings.tsx'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      {
        path: 'legacy',
        // Loaded on demand: it pulls in the timelock and encryption libraries (about 275 kB).
        lazy: async () => ({ Component: (await import('./routes/Legacy.tsx')).Legacy }),
      },
      {
        path: 'legacy/silent',
        lazy: async () => ({ Component: (await import('./routes/Silent.tsx')).Silent }),
      },
      { path: 'u', element: <Send /> },
      { path: 'blind-pot', element: <BlindPot /> },
      { path: 'blind-pot/give', element: <Give /> },
      { path: 'blind-pot/:id', element: <PotPage /> },
      { path: 'unsigned', element: <Unsigned /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'settings', element: <Settings /> },
      { path: 'components', element: <Components /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
