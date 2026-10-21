// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuardianInvite } from '../../../app/routes/GuardianInvite.tsx'
import { useSettings } from '../../../app/settingsStore.ts'
import { ToastViewport } from '../../../components/Toasts.tsx'
import { useToasts } from '../../../components/toastStore.ts'
import { decodeContact } from '../../contacts/contacts.ts'
import { ReceiveWalletContext, type ReceiveWalletPort } from '../../receive/walletPort.ts'
import { InviteGuardian } from './InviteGuardian.tsx'
import { encodeInvite, readInviteFromHash } from './invite.ts'

const A = 'utest1adaaddressadaaddressadaaddress'

beforeEach(() => {
  useToasts.setState({ toasts: [] })
  useSettings.getState().setLanguage('en')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function wallet(): ReceiveWalletPort & { made: number } {
  const w = {
    made: 0,
    ownAddress: () => Promise.resolve(A),
    newAddress: () => Promise.resolve(`utest1freshaddressfreshaddress${String(++w.made)}`),
  }
  return w
}

function renderInvite(hash: string, w: ReceiveWalletPort | null) {
  return render(
    <MemoryRouter initialEntries={[`/invite${hash}`]}>
      <ReceiveWalletContext.Provider value={w}>
        <GuardianInvite />
      </ReceiveWalletContext.Provider>
      <ToastViewport />
    </MemoryRouter>,
  )
}

describe('InviteGuardian (owner side)', () => {
  it('makes a link that holds only the name, and copies it', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText }, languages: ['en'] })
    render(
      <>
        <InviteGuardian />
        <ToastViewport />
      </>,
    )
    const input = screen.getByLabelText<HTMLInputElement>('Invitation link')
    expect(readInviteFromHash(new URL(input.value).hash)).toEqual({})
    fireEvent.change(screen.getByLabelText('Your name (optional)'), { target: { value: 'Ada' } })
    expect(readInviteFromHash(new URL(input.value).hash)).toEqual({ owner: 'Ada' })
    expect(new URL(input.value).pathname).toBe('/invite')
    fireEvent.click(screen.getByRole('button', { name: 'Copy invitation' }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(input.value)
    })
    expect(await screen.findByText('Invitation copied.')).toBeTruthy()
  })
})

describe('GuardianInvite page (guardian side)', () => {
  it('explains the role and shows who is asking', async () => {
    renderInvite(`#${encodeInvite({ owner: 'Ada' })}`, wallet())
    expect(screen.getByText('Ada asks you to be a guardian.')).toBeTruthy()
    expect(screen.getByText('What a guardian does')).toBeTruthy()
    expect(screen.getByRole('note').textContent).toMatch(/Anyone can make an invitation/)
    await screen.findByLabelText('Reply link')
  })

  it('says so when the inviter gave no name', () => {
    renderInvite(`#${encodeInvite({})}`, wallet())
    expect(screen.getByText('Someone asks you to be a guardian.')).toBeTruthy()
  })

  it('shows a name as plain text, never as markup', () => {
    const name = '<img src=x onerror=alert(1)>'
    renderInvite(`#${encodeInvite({ owner: name })}`, wallet())
    expect(screen.getByText(`${name} asks you to be a guardian.`)).toBeTruthy()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it('makes a reply link that adds the guardian as a contact, with a chosen name', async () => {
    renderInvite(`#${encodeInvite({ owner: 'Ada' })}`, wallet())
    const input = await screen.findByLabelText<HTMLInputElement>('Reply link')
    expect(decodeContact(new URL(input.value).hash.slice(1))).toEqual({ address: A })
    expect(new URL(input.value).pathname).toBe('/add')
    fireEvent.change(screen.getByLabelText('Your name (optional)'), { target: { value: 'Bo' } })
    expect(decodeContact(new URL(input.value).hash.slice(1))).toEqual({ address: A, name: 'Bo' })
    expect(screen.getByRole('img', { name: 'QR code for your reply link' })).toBeTruthy()
  })

  it('can switch to a fresh address', async () => {
    const w = wallet()
    renderInvite(`#${encodeInvite({})}`, w)
    await screen.findByLabelText('Reply link')
    fireEvent.click(screen.getByRole('button', { name: 'Use a fresh address for this' }))
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Reply link').value).not.toContain(A)
    })
    expect(w.made).toBe(1)
  })

  it('says there is no wallet yet, without a reply link', () => {
    renderInvite(`#${encodeInvite({})}`, null)
    expect(screen.getByText('No wallet yet')).toBeTruthy()
    expect(screen.queryByLabelText('Reply link')).toBeNull()
  })

  it('refuses a broken or foreign link and shows no wallet data', () => {
    renderInvite('#garbage', wallet())
    expect(screen.getByText('This invitation does not look right')).toBeTruthy()
    expect(screen.queryByLabelText('Reply link')).toBeNull()
  })

  it('is shown in the chosen language', async () => {
    useSettings.getState().setLanguage('es')
    renderInvite(`#${encodeInvite({ owner: 'Ada' })}`, wallet())
    expect(screen.getByText('Ada te pide que seas guardián.')).toBeTruthy()
    expect(screen.getByText('Qué hace un guardián')).toBeTruthy()
    await screen.findByLabelText('Enlace de respuesta')
  })
})
