import { describe, expect, it } from 'vitest'
import { isWorking, trackWork, whenIdle } from './inflight.ts'

describe('work in flight', () => {
  it('counts a task until it settles, and passes its result on', async () => {
    let release!: (value: number) => void
    const done = trackWork(
      () =>
        new Promise<number>((resolve) => {
          release = resolve
        }),
    )
    expect(isWorking()).toBe(true)
    release(7)
    expect(await done).toBe(7)
    expect(isWorking()).toBe(false)
  })

  it('stops counting when a task fails', async () => {
    await expect(trackWork(() => Promise.reject(new Error('no')))).rejects.toThrow('no')
    expect(isWorking()).toBe(false)
  })

  it('makes a waiter wait for every task, and none when there are none', async () => {
    await whenIdle()
    const releases: (() => void)[] = []
    const tasks = [0, 1].map(() =>
      trackWork(
        () =>
          new Promise<void>((resolve) => {
            releases.push(resolve)
          }),
      ),
    )
    let idle = false
    const waiting = whenIdle().then(() => {
      idle = true
    })
    releases[0]?.()
    await tasks[0]
    await Promise.resolve()
    expect(idle).toBe(false)
    releases[1]?.()
    await tasks[1]
    await waiting
    expect(idle).toBe(true)
  })
})
