import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Num, Transition } from '../src/index.js'
import * as Machine from '../src/machine.js'

const Counter = Schema.Struct({ count: Schema.Int })

describe('Transition.lazy and lazy child machines (Phase 7 Bout 7.2)', () => {
  it('deduplicates concurrent Transition.lazy loads and retries cleanly after failure', async () => {
    let attempts = 0
    const inc = Transition.make({
      state: Counter,
      input: Schema.Struct({ by: Schema.Int }),
      apply: ({ state, input }) => [Transition.set(state.count, Num.add(state.count, input.by))],
    })

    const lazyInc = Transition.lazy(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('network error')
      return { default: inc }
    })

    expect(Transition.isLazy(lazyInc)).toBe(true)
    expect(lazyInc.isLoaded()).toBe(false)
    expect(Option.isNone(lazyInc.current())).toBe(true)

    await expect(lazyInc.resolve()).rejects.toThrow('network error')
    expect(lazyInc.isLoaded()).toBe(false)

    // Two concurrent retries share one loader invocation
    const [a, b] = await Promise.all([lazyInc.resolve(), lazyInc.resolve()])
    expect(attempts).toBe(2)
    expect(a).toBe(inc)
    expect(b).toBe(inc)
    expect(lazyInc.isLoaded()).toBe(true)
    expect(Option.getOrUndefined(lazyInc.current())).toBe(inc)
  })

  it('supports lazyChildren in Machine.compose with deduplication and retry on failure', async () => {
    let attempts = 0
    const child = Machine.make({
      state: Counter,
      transitions: {
        Reset: Transition.make({
          state: Counter,
          input: Schema.Struct({}),
          apply: ({ state }) => [Transition.set(state.count, 0)],
        }),
      },
    })

    const parent = Machine.compose({
      state: Counter,
      transitions: {
        Bump: Transition.make({
          state: Counter,
          input: Schema.Struct({}),
          apply: ({ state }) => [Transition.set(state.count, Num.add(state.count, 1))],
        }),
      },
      children: {},
      lazyChildren: {
        Cart: async () => {
          attempts += 1
          if (attempts === 1) throw new Error('chunk failed')
          return child
        },
      },
    })

    expect(parent.lazyChildren.Cart.prefix).toBe('Cart')
    expect(parent.lazyChildren.Cart.isLoaded()).toBe(false)

    await expect(parent.lazyChildren.Cart.resolve()).rejects.toThrow('chunk failed')
    const [m1, m2] = await Promise.all([
      parent.lazyChildren.Cart.resolve(),
      parent.lazyChildren.Cart.resolve(),
    ])
    expect(attempts).toBe(2)
    expect(m1).toBe(child)
    expect(m2).toBe(child)
    expect(parent.lazyChildren.Cart.isLoaded()).toBe(true)
  })
})
