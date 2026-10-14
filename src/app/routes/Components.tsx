import { useState, type ReactNode } from 'react'
import { AmountInput } from '../../components/AmountInput.tsx'
import { Button } from '../../components/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { CountdownTimer } from '../../components/CountdownTimer.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { FeePreview } from '../../components/FeePreview.tsx'
import { TextArea, TextInput } from '../../components/Field.tsx'
import { QrDisplay } from '../../components/QrDisplay.tsx'
import { QrScanner } from '../../components/QrScanner.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { formatZec } from '../../lib/zec.ts'

const SAMPLE_FEE_ZAT = 10_000n
const TEN_MINUTES_MS = 10 * 60 * 1000

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl">{title}</h2>
      {children}
    </section>
  )
}

/** Every shared component with sample data. Nothing here touches a wallet or the network. */
export function Components() {
  const push = useToasts((state) => state.push)
  const [amount, setAmount] = useState<bigint | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [timerTarget] = useState(() => Date.now() + TEN_MINUTES_MS)

  return (
    <div className="space-y-10 py-10">
      <div>
        <h1 className="text-3xl">Component gallery</h1>
        <p className="mt-2 text-muted">The shared building blocks, with sample data.</p>
      </div>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button busy>Working</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Name" hint="Shown only to you." placeholder="A name" />
          <TextInput label="With an error" error="This field is required." defaultValue="" />
        </div>
        <TextArea label="Message" hint="Up to 2 KB." />
      </Section>

      <Section title="Amount and fee">
        <div className="grid gap-4 sm:grid-cols-2">
          <AmountInput
            hint="Try 0.05, then 0.123456789."
            onChange={setAmount}
            minZat={100_000n}
            maxZat={5_000_000_000n}
          />
          <div>
            <p className="mb-1.5 text-sm font-medium">Preview (sample fee)</p>
            {amount === null ? (
              <p className="text-sm text-muted">Enter a valid amount to see the total.</p>
            ) : (
              <FeePreview amountZat={amount} feeZat={SAMPLE_FEE_ZAT} />
            )}
          </div>
        </div>
        {amount !== null && <p className="sr-only">Parsed {formatZec(amount)} ZEC</p>}
      </Section>

      <Section title="Countdown">
        <p className="text-sm text-muted">The last ten minutes of a session, counting down.</p>
        <CountdownTimer targetMs={timerTarget} doneLabel="Session ended" />
      </Section>

      <Section title="QR code">
        <QrDisplay value="zealed-sample-code" label="Sample QR code" />
        {scanning ? (
          <QrScanner
            onScan={() => {
              setScanning(false)
              setScanned(true)
              push('success', 'A QR code was read.')
            }}
            onCancel={() => {
              setScanning(false)
            }}
          />
        ) : (
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setScanned(false)
                setScanning(true)
              }}
            >
              Scan a QR code
            </Button>
            {scanned && <span className="text-sm text-good">Scanned.</span>}
          </div>
        )}
      </Section>

      <Section title="Dialog and messages">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setConfirmOpen(true)
            }}
          >
            Open confirmation
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              push('info', 'Here is some information.')
            }}
          >
            Info message
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              push('success', 'That worked.')
            }}
          >
            Success message
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              push('error', 'Something went wrong.')
            }}
          >
            Error message
          </Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title="Delete this sample?"
          confirmLabel="Delete"
          danger
          onCancel={() => {
            setConfirmOpen(false)
          }}
          onConfirm={() => {
            setConfirmOpen(false)
            push('success', 'Deleted.')
          }}
        >
          This is only a demonstration. Nothing is deleted.
        </ConfirmDialog>
      </Section>

      <Section title="Empty state">
        <EmptyState
          title="Nothing here yet"
          action={<Button variant="secondary">Create one</Button>}
        >
          Empty screens explain what will appear and what to do next.
        </EmptyState>
      </Section>
    </div>
  )
}
