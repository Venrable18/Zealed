import { useEffect, useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { TextInput } from '../../components/Field.tsx'
import { QrDisplay } from '../../components/QrDisplay.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { CONTACT_NAME_MAX, contactUrl } from '../../features/contacts/contacts.ts'
import { useReceiveWallet } from '../../features/receive/walletPort.ts'

export function Receive() {
  const wallet = useReceiveWallet()
  const push = useToasts((state) => state.push)
  const [address, setAddress] = useState<string | undefined>()
  const [failed, setFailed] = useState(false)
  const [fresh, setFresh] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    if (wallet === null) return
    let cancelled = false
    wallet.ownAddress().then(
      (value) => {
        if (!cancelled) setAddress(value)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [wallet])

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text)
      push('success', done)
    } catch {
      push('error', 'Could not copy. Select the text and copy it by hand.')
    }
  }

  async function makeNew() {
    if (wallet === null) return
    try {
      setAddress(await wallet.newAddress())
      setFresh(true)
    } catch {
      push('error', 'A new address could not be made. Try again.')
    }
  }

  const cleanName = name.trim()
  const link =
    address === undefined
      ? undefined
      : contactUrl(window.location.origin, {
          address,
          ...(cleanName === '' ? {} : { name: cleanName }),
        })

  return (
    <div className="space-y-10 py-10">
      <div>
        <h1 className="text-3xl">Receive</h1>
        <p className="mt-3 max-w-prose text-muted">
          Your address, to give to someone who wants to send you money, a letter or a message.
        </p>
      </div>

      {wallet === null && (
        <EmptyState title="No wallet yet">
          The wallet is still being built, so there is no address to show yet.
        </EmptyState>
      )}
      {failed && (
        <p role="alert" className="rounded-control border border-bad bg-bad-soft px-4 py-3">
          Your address could not be read.
        </p>
      )}

      {address !== undefined && (
        <>
          <section aria-labelledby="address-title" className="space-y-4">
            <h2 id="address-title" className="text-xl">
              {fresh ? 'A fresh address' : 'Your address'}
            </h2>
            <QrDisplay value={`zcash:${address}`} label="QR code for your address" />
            <p
              className="break-all rounded-control border border-line bg-surface p-3 font-mono text-sm"
              data-testid="own-address"
            >
              {address}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  void copy(address, 'Address copied.')
                }}
              >
                Copy address
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void makeNew()
                }}
              >
                Make a new address
              </Button>
            </div>
            <p className="text-sm text-muted">
              Giving every person a different address keeps them from being linked to each other.
              Use “Make a new address” before sharing with someone new.
            </p>
          </section>

          <section aria-labelledby="link-title" className="space-y-4">
            <h2 id="link-title" className="text-xl">
              A contact link
            </h2>
            <p className="max-w-prose text-muted">
              Send this link to someone so they can add you as a contact, a guardian or an heir
              without typing your address. The address is in the part of the link that is never sent
              to any server.
            </p>
            <TextInput
              label="Your name (optional)"
              value={name}
              maxLength={CONTACT_NAME_MAX * 4}
              onChange={(e) => {
                setName(e.target.value)
              }}
              autoComplete="off"
              hint="Suggested to the person who opens it. They can change it."
            />
            {link !== undefined && (
              <>
                <label htmlFor="contact-link" className="block text-sm font-medium">
                  Contact link
                </label>
                <input
                  id="contact-link"
                  readOnly
                  value={link}
                  onFocus={(e) => {
                    e.target.select()
                  }}
                  className="block min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    void copy(link, 'Link copied.')
                  }}
                >
                  Copy link
                </Button>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
