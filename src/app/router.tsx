import { createBrowserRouter } from 'react-router'
import { Loading } from '../components/Loading.tsx'
import { RootLayout } from './RootLayout.tsx'
import { BlindPot } from './routes/BlindPot.tsx'
import { Give } from './routes/Give.tsx'
import { Components } from './routes/Components.tsx'
import { Home } from './routes/Home.tsx'
import { Landing } from './routes/Landing.tsx'
import { NotFound } from './routes/NotFound.tsx'
import { PotPage } from './routes/PotPage.tsx'
import { Unsigned } from './routes/Unsigned.tsx'
import { Send } from './routes/Send.tsx'
import { AddContact } from './routes/AddContact.tsx'
import { Contacts } from './routes/Contacts.tsx'
import { GuardianInvite } from './routes/GuardianInvite.tsx'
import { Receive } from './routes/Receive.tsx'
import { Wallet } from './routes/Wallet.tsx'
import { Settings } from './routes/Settings.tsx'

export const router = createBrowserRouter([
  // The public front page, outside the app (no lock screen, no wallet).
  { path: '/', element: <Landing />, HydrateFallback: Loading },
  {
    element: <RootLayout />,
    HydrateFallback: Loading,
    children: [
      { path: 'app', element: <Home /> },
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
      {
        path: 'dashboard',
        // Loaded on demand: it reads Legacy's guardian and heir logic, which pulls in the timelock library.
        lazy: async () => ({ Component: (await import('./routes/Dashboard.tsx')).Dashboard }),
      },
      { path: 'contacts', element: <Contacts /> },
      { path: 'add', element: <AddContact /> },
      { path: 'invite', element: <GuardianInvite /> },
      { path: 'wallet', element: <Wallet /> },
      { path: 'receive', element: <Receive /> },
      { path: 'settings', element: <Settings /> },
      { path: 'components', element: <Components /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
