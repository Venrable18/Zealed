import { describe, expect, it } from 'vitest'
import { summarizeWithdrawal } from './describe.ts'

const POT = 'utest1pot'
const HOST = 'utest1host'

describe('summarizeWithdrawal', () => {
  it('reads a withdrawal with nothing coming back as everything', () => {
    expect(summarizeWithdrawal([{ address: HOST, zat: '900000' }], POT)).toEqual({
      kind: 'all',
      paidZat: 900000n,
      staysZat: 0n,
    })
  })

  it('reads change back to the pot as part of the pot staying', () => {
    expect(
      summarizeWithdrawal(
        [
          { address: HOST, zat: '300000' },
          { address: POT, zat: '590000' },
        ],
        POT,
      ),
    ).toEqual({ kind: 'part', paidZat: 300000n, staysZat: 590000n })
  })

  it('counts an output with no address as leaving the pot, never as staying', () => {
    expect(summarizeWithdrawal([{ zat: '1000' }], POT)).toMatchObject({
      kind: 'all',
      paidZat: 1000n,
    })
  })
})
