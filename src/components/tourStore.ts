import { create } from 'zustand'

interface TourState {
  open: boolean
  step: number
  start: () => void
  stop: () => void
  go: (step: number) => void
}

/** Whether the guided tour is showing, and which step. Nothing about it is saved. */
export const useTour = create<TourState>()((set) => ({
  open: false,
  step: 0,
  start: () => {
    set({ open: true, step: 0 })
  },
  stop: () => {
    set({ open: false })
  },
  go: (step) => {
    set({ step })
  },
}))
