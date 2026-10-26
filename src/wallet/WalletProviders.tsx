import { useContext, type ReactNode } from 'react'
import { ContributorWalletContext } from '../features/blindpot/contributorWallet.ts'
import { PotWalletContext } from '../features/blindpot/walletPort.ts'
import { DashboardWalletContext } from '../features/dashboard/walletPort.ts'
import { LegacyWalletContext } from '../features/legacy/walletPort.ts'
import { ReceiveWalletContext } from '../features/receive/walletPort.ts'
import { SharedPotContext } from '../features/blindpot/shared/store.ts'
import { SeedContext } from '../features/settings/seedPort.ts'
import { UnsignedWalletContext } from '../features/unsigned/walletPort.ts'
import { useWalletRuntime } from './runtime.ts'

/**
 * Gives every feature the real wallet once it is open. Until then each keeps whatever it was given
 * from outside (nothing in the shipped app, a simulated wallet in the test harness), so screens
 * say "no wallet yet" rather than pretending.
 */
export function WalletProviders({ children }: { children: ReactNode }) {
  const wallet = useWalletRuntime((state) => state.wallet)
  const pot = useContext(PotWalletContext)
  const contributor = useContext(ContributorWalletContext)
  const legacy = useContext(LegacyWalletContext)
  const unsigned = useContext(UnsignedWalletContext)
  const dashboard = useContext(DashboardWalletContext)
  const receive = useContext(ReceiveWalletContext)
  const seed = useContext(SeedContext)
  const shared = useContext(SharedPotContext)
  return (
    <PotWalletContext.Provider value={wallet ?? pot}>
      <ContributorWalletContext.Provider value={wallet ?? contributor}>
        <LegacyWalletContext.Provider value={wallet ?? legacy}>
          <UnsignedWalletContext.Provider value={wallet ?? unsigned}>
            <DashboardWalletContext.Provider value={wallet ?? dashboard}>
              <ReceiveWalletContext.Provider value={wallet ?? receive}>
                <SeedContext.Provider value={wallet ?? seed}>
                  <SharedPotContext.Provider value={wallet ?? shared}>
                    {children}
                  </SharedPotContext.Provider>
                </SeedContext.Provider>
              </ReceiveWalletContext.Provider>
            </DashboardWalletContext.Provider>
          </UnsignedWalletContext.Provider>
        </LegacyWalletContext.Provider>
      </ContributorWalletContext.Provider>
    </PotWalletContext.Provider>
  )
}
