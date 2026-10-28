// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Tour } from './Tour.tsx'
import { useTour } from './tourStore.ts'

beforeEach(() => {
  useTour.setState({ open: false, step: 0 })
})
afterEach(cleanup)

const open = () => {
  act(() => {
    useTour.getState().start()
  })
}

describe('the guided tour', () => {
  it('shows nothing until it is started', () => {
    render(<Tour />)
    expect(screen.queryByRole('dialog')).toBeNull()
    open()
    expect(screen.getByRole('dialog', { name: 'Guided tour' })).toBeTruthy()
    expect(screen.getByText('Step 1 of 8')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Welcome to Zealed' })).toBeTruthy()
  })

  it('goes forward and back, and has no Back on the first step', () => {
    render(<Tour />)
    open()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Step 2 of 8')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your numbers' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Step 1 of 8')).toBeTruthy()
  })

  it('works from the keyboard: arrows move, Escape closes', () => {
    render(<Tour />)
    open()
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(screen.getByText('Step 2 of 8')).toBeTruthy()
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    expect(screen.getByText('Step 1 of 8')).toBeTruthy()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('can be skipped, and offers no skip on the last step, which closes it', () => {
    render(<Tour />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Skip the tour' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    open()
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Step 8 of 8')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip the tour' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start using Zealed' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('starts again from the first step each time, and gives focus back when it closes', () => {
    render(
      <>
        <button type="button">Take the tour</button>
        <Tour />
      </>,
    )
    const opener = screen.getByRole('button', { name: 'Take the tour' })
    opener.focus()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(document.activeElement).toBe(opener)
    open()
    expect(screen.getByText('Step 1 of 8')).toBeTruthy()
  })
})
