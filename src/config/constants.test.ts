import { describe, expect, it } from 'vitest'
import { POT_DENOMINATIONS_ZAT, POT_WISH_PIECE_ZAT, ZATOSHIS_PER_ZEC } from './constants.ts'

describe('POT_DENOMINATIONS_ZAT', () => {
  it('is the 1-2-5 series from 0.001 to 10 ZEC', () => {
    const zec = POT_DENOMINATIONS_ZAT.map((zat) => Number(zat) / Number(ZATOSHIS_PER_ZEC))
    expect(zec).toEqual([0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10])
  })

  it('carries the wish on the smallest piece', () => {
    expect(POT_WISH_PIECE_ZAT).toBe(POT_DENOMINATIONS_ZAT[0])
  })
})
