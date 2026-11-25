// @vitest-environment jsdom
import { Schema } from 'effect'
import { Num, Path, Transition } from 'metakit'
import { describe, expect, it, vi } from 'vitest'
import { Binder, Binding, type BinderTransition } from '../src/binder.js'
import { claimBinder } from '../src/handoff.js'

const Counter = Schema.Struct({ count: Schema.Int })
type Counter = typeof Counter.Type

const $ = Path.forSchema(Counter)
const bindings = Binding.define<Counter>({
  count: Binding.text($.count),
})

const IncInput = Schema.Struct({ by: Schema.Int })
const incTransition = Transition.make({
  state: Counter,
  input: IncInput,
  apply: ({ state, input }) => [Transition.set(state.count, Num.add(state.count, input.by))],
})

const incEntry: BinderTransition<Counter, 'Inc'> = {
  tag: 'Inc',
  schema: IncInput,
  transition: incTransition,
}

const makeRoot = (html: string): HTMLElement => {
  document.body.innerHTML = `<div data-foldkit-app>${html}</div>`
  return document.querySelector<HTMLElement>('[data-foldkit-app]')!
}

describe('Binder lazy chunk loading policy and failure handling (Phase 7 Bouts 7.4–7.5)', () => {
  it('prefetches on pointerover and executes a held press exactly once even if clicked twice', async () => {
    const root = makeRoot(
      `<span data-fk-anchor="count">0</span><button id="btn" data-fk-msg="Inc" data-fk-payload='{"by":2}'>+</button>`,
    )
    let resolveChunk!: (entry: BinderTransition<Counter, 'Inc'>) => void
    let loadCount = 0
    const handle = Binder.start({
      manifest: { transitions: {}, bindings },
      envelope: { model: { count: 0 }, root },
      wake: async () => undefined,
      chunks: {
        Inc: () => {
          loadCount += 1
          return new Promise<BinderTransition<Counter, 'Inc'>>(resolve => {
            resolveChunk = resolve
          })
        },
      },
    })

    const btn = root.querySelector<HTMLButtonElement>('#btn')!
    // Intent event prefetches the chunk once
    btn.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(loadCount).toBe(1)

    // Clicking twice while chunk is held queues only one execution
    btn.click()
    btn.click()
    expect(root.querySelector('[data-fk-anchor="count"]')!.textContent).toBe('0')

    resolveChunk(incEntry)
    await vi.waitFor(() => {
      expect(root.querySelector('[data-fk-anchor="count"]')!.textContent).toBe('2')
    })
    expect(handle.model()).toEqual({ count: 2 })
    expect(loadCount).toBe(1)
    claimBinder()?.take()
  })

  it('retries a failed non-form chunk once and marks aria-disabled when retry also fails', async () => {
    const root = makeRoot(
      `<span data-fk-anchor="count">0</span><button id="btn" data-fk-msg="Inc" data-fk-payload='{"by":1}'>+</button>`,
    )
    let attempts = 0
    const failed = vi.fn()
    Binder.start({
      manifest: { transitions: {}, bindings },
      envelope: { model: { count: 0 }, root },
      wake: async () => undefined,
      chunks: {
        Inc: async () => {
          attempts += 1
          throw new Error(`boom ${attempts}`)
        },
      },
      onChunkFailed: failed,
    })

    const btn = root.querySelector<HTMLButtonElement>('#btn')!
    btn.click()

    await vi.waitFor(() => {
      expect(failed).toHaveBeenCalledTimes(1)
    })
    expect(attempts).toBe(2)
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    expect(btn.getAttribute('data-fk-chunk-failed')).toBe('Inc')
    claimBinder()?.take()
  })

  it('releases a held form control to browser submission when its chunk fails', async () => {
    const root = makeRoot(
      `<form id="f"><button id="btn" type="submit" data-fk-msg="Inc" data-fk-payload='{"by":1}'>+</button></form>`,
    )
    const form = root.querySelector<HTMLFormElement>('#f')!
    const submitSpy = vi.spyOn(form, 'submit').mockImplementation(() => undefined)
    let attempts = 0

    Binder.start({
      manifest: { transitions: {}, bindings },
      envelope: { model: { count: 0 }, root },
      wake: async () => undefined,
      chunks: {
        Inc: async () => {
          attempts += 1
          throw new Error('offline')
        },
      },
    })

    root.querySelector<HTMLButtonElement>('#btn')!.click()
    await vi.waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(1)
    })
    expect(attempts).toBe(1)
    claimBinder()?.take()
  })
})
