import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  /** Shows a toast. Messages must never contain keys, amounts, addresses or memo text. */
  push: (kind: ToastKind, message: string) => number
  dismiss: (id: number) => void
}

const MAX_VISIBLE = 3
let nextId = 1

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }].slice(-MAX_VISIBLE) }))
    return id
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },
}))
