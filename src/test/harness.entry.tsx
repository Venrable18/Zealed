// This is a test entry point, not a hot-reloaded module, so the fast-refresh rule does not apply.
/* eslint-disable react-refresh/only-export-components */
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from '../app/router.tsx'
import { applyDemoParam } from '../app/settingsStore.ts'
import { initTheme } from '../app/theme.ts'
import '../index.css'
import { ContributorWalletContext } from '../features/blindpot/contributorWallet.ts'
import { PotWalletContext } from '../features/blindpot/walletPort.ts'
import { DashboardWalletContext } from '../features/dashboard/walletPort.ts'
import { LegacyWalletContext } from '../features/legacy/walletPort.ts'
import { SeedContext } from '../features/settings/seedPort.ts'
import { UnsignedWalletContext } from '../features/unsigned/walletPort.ts'
import { generateKeypair, signCheckIn, signRevoke } from '../crypto/sign.ts'
import { useSilent } from '../features/legacy/silent/stores.ts'
import { encodeUnsigned } from '../features/unsigned/format.ts'
import { toMemos } from '../zmp/index.ts'
import { SimWalletClient } from './simClient.ts'

/**
 * TEST SUPPORT. Mounts the real app, unchanged, with a simulated wallet provided to every feature,
 * so multi-actor scenarios can drive the real screens end to end. Built only by the scenario tests
 * and never part of the shipped app.
 */
function Wallets({ children }: { children: ReactNode }) {
  const wallet = new SimWalletClient(window.__simWalletId)
  return (
    <PotWalletContext.Provider value={wallet}>
      <ContributorWalletContext.Provider value={wallet}>
        <LegacyWalletContext.Provider value={wallet}>
          <UnsignedWalletContext.Provider value={wallet}>
            <DashboardWalletContext.Provider value={wallet}>
              <SeedContext.Provider value={wallet}>{children}</SeedContext.Provider>
            </DashboardWalletContext.Provider>
          </UnsignedWalletContext.Provider>
        </LegacyWalletContext.Provider>
      </ContributorWalletContext.Provider>
    </PotWalletContext.Provider>
  )
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))

/**
 * Helpers the scenario tests call to build messages that the app itself would never send: an
 * underpaid message, a forged check-in or revoke. They return memos as base64 text.
 */
Object.assign(window, {
  __zealed: {
    unsignedMemos: (body: string) =>
      toMemos('UNSIGNED_MSG', encodeUnsigned({ body })).map(toBase64),
    forgedCheckIn: (bundleIdHex: string, counter: number) =>
      toMemos(
        'CHECKIN',
        signCheckIn(generateKeypair().privateKey, {
          bundleId: fromHex(bundleIdHex),
          counter,
          timestampMs: Date.now(),
        }),
      ).map(toBase64),
    /** The IDs of the letters this actor guards, read from the app's own store (the screens do not show them). */
    guardedBundleIds: () => useSilent.getState().guardians.map((record) => record.bundleIdHex),
    forgedRevoke: (bundleIdHex: string) =>
      toMemos(
        'REVOKE',
        signRevoke(generateKeypair().privateKey, {
          bundleId: fromHex(bundleIdHex),
          timestampMs: Date.now(),
        }),
      ).map(toBase64),
  },
})

applyDemoParam(window.location.search)
initTheme()

const root = document.getElementById('root')
if (root === null) throw new Error('Missing #root element')
createRoot(root).render(
  <StrictMode>
    <Wallets>
      <RouterProvider router={router} />
    </Wallets>
  </StrictMode>,
)
