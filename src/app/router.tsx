import { createBrowserRouter } from 'react-router'
import { RootLayout } from './RootLayout.tsx'
import { Home } from './routes/Home.tsx'
import { NotFound } from './routes/NotFound.tsx'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
