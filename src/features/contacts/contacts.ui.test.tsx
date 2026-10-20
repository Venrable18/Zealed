// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressInput } from '../../components/AddressInput.tsx'
import { ToastViewport } from '../../components/Toasts.tsx'
import { useToasts } from '../../components/toastStore.ts'
import { AddContact } from '../../app/routes/AddContact.tsx'
import { Contacts } from '../../app/routes/Contacts.tsx'
import { Receive } from '../../app/routes/Receive.tsx'
import { ReceiveWalletContext, type ReceiveWalletPort } from '../receive/walletPort.ts'
import { contactUrl, encodeContact, readContactFromHash, useContacts } from './contacts.ts'

const A = 'utest1adaaddressadaaddressadaaddress'
const B = 'utest1boaddressboaddressboaddressbo'

vi.mock('../../components/QrScanner.tsx', () => ({
  QrScanner: ({ onScan, onCancel }: { onScan: (text: string) => void; onCancel: () => void }) => (
    <div>
      <button
        onClick={() => {
          onScan('zcash:utest1scannedaddressscannedaddress?label=x')
        }}
      >
        pretend scan address
      </button>
      <button
        onClick={() => {
          onScan('this is not an address')
        }}
      >
        pretend scan junk
      </button>
      <button onClick={onCancel}>cancel scan</button>
    </div>
  ),
}))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
  }
})

beforeEach(() => {
  useContacts.setState({ contacts: [] })
  useToasts.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AddressInput', () => {
  function Harness({ start = '' }: { start?: string }) {
    const [value, setValue] = useState(start)
    return (
      <>
        <AddressInput label="Recipient’s address" value={value} onChange={setValue} />
        <output data-testid="value">{value}</output>
      </>
    )
  }

  it('is a labelled text field first', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Recipient’s address'), { target: { value: A } })
    expect(screen.getByTestId('value').textContent).toBe(A)
  })

  it('offers saved contacts only when there are some, and fills the address from one', () => {
    const { unmount } = render(<Harness />)
    expect(screen.queryByLabelText('Choose a saved contact')).toBeNull()
    unmount()
    useContacts.getState().add('Ada', A)
    useContacts.getState().add('Bo', B)
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Choose a saved contact'), {
      target: { value: useContacts.getState().contacts[1]?.id },
    })
    expect(screen.getByTestId('value').textContent).toBe(B)
    expect(screen.getByText('Saved contact: Bo')).toBeTruthy()
  })

  it('turns a contact link or payment request pasted into the field into the address it holds', () => {
    const parsed = vi.fn()
    function Watching() {
      const [value, setValue] = useState('')
      return (
        <>
          <AddressInput
            label="Recipient’s address"
            value={value}
            onChange={setValue}
            onParsed={parsed}
          />
          <output data-testid="value">{value}</output>
        </>
      )
    }
    render(<Watching />)
    fireEvent.change(screen.getByLabelText('Recipient’s address'), {
      target: { value: contactUrl('https://zealed.example', { address: B, name: 'Bo' }) },
    })
    expect(screen.getByTestId('value').textContent).toBe(B)
    expect(parsed).toHaveBeenCalledWith({ address: B, name: 'Bo' })
    fireEvent.change(screen.getByLabelText('Recipient’s address'), {
      target: { value: `zcash:${A}?amount=1` },
    })
    expect(screen.getByTestId('value').textContent).toBe(A)
    // Ordinary typing, even half an address, is left alone.
    fireEvent.change(screen.getByLabelText('Recipient’s address'), {
      target: { value: 'utest1half' },
    })
    expect(screen.getByTestId('value').textContent).toBe('utest1half')
    expect(parsed).toHaveBeenCalledTimes(2)
  })

  it('shows the contact name when a saved address is typed', () => {
    useContacts.getState().add('Ada', A)
    render(<Harness start={A} />)
    expect(screen.getByText('Saved contact: Ada')).toBeTruthy()
  })

  it('fills the address from a scanned QR code, reading payment requests, and refuses anything else', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Scan a QR code' }))
    fireEvent.click(screen.getByRole('button', { name: 'pretend scan address' }))
    expect(screen.getByTestId('value').textContent).toBe('utest1scannedaddressscannedaddress')
    expect(screen.queryByRole('button', { name: 'cancel scan' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Scan a QR code' }))
    fireEvent.click(screen.getByRole('button', { name: 'pretend scan junk' }))
    expect(screen.getByRole('alert').textContent).toContain(
      'QR code does not contain a Zcash address',
    )
    expect(screen.getByTestId('value').textContent).toBe('utest1scannedaddressscannedaddress')
  })

  it('can close the scanner without choosing anything', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Scan a QR code' }))
    fireEvent.click(screen.getByRole('button', { name: 'cancel scan' }))
    expect(screen.getByRole('button', { name: 'Scan a QR code' })).toBeTruthy()
  })

  it('pastes an address or a contact link from the clipboard where the browser allows it', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: () =>
          Promise.resolve(contactUrl('https://zealed.example', { address: B, name: 'Bo' })),
      },
    })
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
    await waitFor(() => {
      expect(screen.getByTestId('value').textContent).toBe(B)
    })
  })

  it('says so when the clipboard has no address, and has no Paste button where the browser cannot read it', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { readText: () => Promise.resolve('just some words') },
    })
    const { unmount } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'clipboard does not contain a Zcash address',
    )
    unmount()
    vi.stubGlobal('navigator', {})
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Paste' })).toBeNull()
  })
})

describe('Contacts page', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <Contacts />
        <ToastViewport />
      </MemoryRouter>,
    )

  it('is empty at first', () => {
    renderPage()
    expect(screen.getByText('No contacts yet')).toBeTruthy()
  })

  it('explains mistakes next to each field, then saves a contact', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))
    expect(await screen.findByText('Give this contact a name.')).toBeTruthy()
    expect(screen.getByText('Enter an address.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))
    expect(await screen.findByText('That does not look like a Zcash address.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Address'), { target: { value: A } })
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))
    expect(await screen.findByText('Ada was saved.')).toBeTruthy()
    expect(screen.getByText(A)).toBeTruthy()
    expect(screen.queryByText('No contacts yet')).toBeNull()
  })

  it('fills the name from a pasted contact link when no name is typed yet', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Address'), {
      target: { value: contactUrl('https://zealed.example', { address: A, name: 'Ada' }) },
    })
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Ada')
    expect(screen.getByLabelText<HTMLInputElement>('Address').value).toBe(A)
  })

  it('does not overwrite a name already typed', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My sister' } })
    fireEvent.change(screen.getByLabelText('Address'), {
      target: { value: contactUrl('https://zealed.example', { address: A, name: 'Ada' }) },
    })
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('My sister')
  })

  it('refuses the same address twice', async () => {
    useContacts.getState().add('Ada', A)
    renderPage()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Again' } })
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: A } })
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))
    expect(await screen.findByText('Already saved as Ada.')).toBeTruthy()
  })

  it('renames a contact, and refuses an empty name', async () => {
    useContacts.getState().add('Ada', A)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Ada' }))
    fireEvent.change(screen.getByLabelText('New name for Ada'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText('That name cannot be used.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('New name for Ada'), { target: { value: 'Ada L.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText('Ada L.', { selector: 'p' })).toBeTruthy()
  })

  it('asks before removing', async () => {
    useContacts.getState().add('Ada', A)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove Ada?' })
    expect(useContacts.getState().contacts).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(useContacts.getState().contacts).toHaveLength(0)
  })

  it('shows contact names as plain text', () => {
    useContacts.getState().add('<img src=x onerror=alert(1)>', A)
    const { container } = renderPage()
    expect(screen.getByText('<img src=x onerror=alert(1)>', { selector: 'p' })).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('AddContact page (a contact link)', () => {
  const at = (hash: string) =>
    render(
      <MemoryRouter initialEntries={[`/add${hash}`]}>
        <Routes>
          <Route path="/add" element={<AddContact />} />
          <Route path="/contacts" element={<h1>Contacts page</h1>} />
        </Routes>
        <ToastViewport />
      </MemoryRouter>,
    )

  it('fills in the suggested name, saves, and goes to the contacts', async () => {
    at(`#${encodeContact({ address: A, name: 'Ada' })}`)
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Ada')
    expect(screen.getByText(A)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada, my sister' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))
    expect(await screen.findByText('Contacts page')).toBeTruthy()
    expect(useContacts.getState().contacts.map((c) => c.name)).toEqual(['Ada, my sister'])
  })

  it('needs a name when the link suggests none', async () => {
    at(`#${encodeContact({ address: A })}`)
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))
    expect(await screen.findByText('Give this contact a name.')).toBeTruthy()
    expect(useContacts.getState().contacts).toHaveLength(0)
  })

  it('says when the address is already saved, instead of adding it twice', () => {
    useContacts.getState().add('Ada', A)
    at(`#${encodeContact({ address: A, name: 'Someone' })}`)
    expect(screen.getByRole('status').textContent).toContain('already saved as Ada')
    expect(screen.queryByRole('button', { name: 'Save contact' })).toBeNull()
  })

  it('refuses broken links', () => {
    at('#garbage')
    expect(screen.getByText('This link does not look right')).toBeTruthy()
    cleanup()
    at('')
    expect(screen.getByText('This link does not look right')).toBeTruthy()
  })

  it('shows a hostile suggested name as plain text only after validation, and refuses unsafe ones in the link', () => {
    at(`#${encodeContact({ address: A, name: 'a‮b' })}`)
    expect(screen.getByText('This link does not look right')).toBeTruthy()
  })
})

describe('Receive page', () => {
  const wallet = (): ReceiveWalletPort & { made: number } => {
    const w = {
      made: 0,
      ownAddress: () => Promise.resolve(A),
      newAddress: () => Promise.resolve(`utest1freshaddressfreshaddress${String(++w.made)}`),
    }
    return w
  }
  const renderPage = (w: ReceiveWalletPort | null) =>
    render(
      <MemoryRouter>
        <ReceiveWalletContext.Provider value={w}>
          <Receive />
        </ReceiveWalletContext.Provider>
        <ToastViewport />
      </MemoryRouter>,
    )

  it('says there is no wallet yet', () => {
    renderPage(null)
    expect(screen.getByText('No wallet yet')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the address, a QR code of it, and a contact link that carries the chosen name', async () => {
    renderPage(wallet())
    expect((await screen.findByTestId('own-address')).textContent).toBe(A)
    expect(screen.getByRole('img', { name: 'QR code for your address' })).toBeTruthy()
    const input = screen.getByLabelText<HTMLInputElement>('Contact link')
    expect(new URL(input.value).pathname).toBe('/add')
    expect(new URL(input.value).search).toBe('')
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: 'Tunde' } })
    expect(decodeHash(screen.getByLabelText<HTMLInputElement>('Contact link').value)).toEqual({
      address: A,
      name: 'Tunde',
    })
  })

  it('makes a fresh address on request and uses it in the link', async () => {
    const w = wallet()
    renderPage(w)
    await screen.findByTestId('own-address')
    fireEvent.click(screen.getByRole('button', { name: 'Make a new address' }))
    expect(await screen.findByText('A fresh address')).toBeTruthy()
    expect(screen.getByTestId('own-address').textContent).toMatch(
      /^utest1freshaddressfreshaddress1$/,
    )
    expect(decodeHash(screen.getByLabelText<HTMLInputElement>('Contact link').value)?.address).toBe(
      'utest1freshaddressfreshaddress1',
    )
  })

  it('copies the address, and says so if copying is not possible', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    renderPage(wallet())
    await screen.findByTestId('own-address')
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(await screen.findByText('Address copied.')).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith(A)
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await screen.findByText(/Could not copy/)).toBeTruthy()
  })

  it('says so when the address cannot be read', async () => {
    renderPage({
      ownAddress: () => Promise.reject(new Error('boom')),
      newAddress: () => Promise.reject(new Error('boom')),
    })
    expect((await screen.findByRole('alert')).textContent).toContain('could not be read')
  })
})

function decodeHash(url: string) {
  return readContactFromHash(new URL(url).hash)
}
