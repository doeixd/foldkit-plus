// @vitest-environment jsdom
import { Schema } from 'effect'
import { Num, Path, Transition } from '@doeixd/metakit'
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
    const requestSubmitSpy = vi.spyOn(form, 'requestSubmit').mockImplementation(() => undefined)
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
      expect(requestSubmitSpy).toHaveBeenCalledTimes(1)
    })
    expect(attempts).toBe(1)
    claimBinder()?.take()
  })

  it('preserves FIFO order between a pending lazy press and an eager press, and flushes pending lazy presses on hand-over', async () => {
    const root = makeRoot(
      `<span data-fk-anchor="count">0</span>` +
        `<button id="lazy" data-fk-msg="LazyAdd" data-fk-payload='{"by":10}'>+10</button>` +
        `<button id="eager" data-fk-msg="Inc" data-fk-payload='{"by":1}'>+1</button>`,
    )
    let resolveLazy!: (entry: BinderTransition<Counter, 'LazyAdd'>) => void
    Binder.start({
      manifest: { transitions: { Inc: incEntry }, bindings },
      envelope: { model: { count: 0 }, root },
      wake: async () => undefined,
      chunks: {
        LazyAdd: () =>
          new Promise<BinderTransition<Counter, 'LazyAdd'>>(resolve => {
            resolveLazy = resolve
          }),
      },
    })

    // Click lazy button, then eager button while lazy is in flight: eager must wait!
    root.querySelector<HTMLButtonElement>('#lazy')!.click()
    root.querySelector<HTMLButtonElement>('#eager')!.click()
    expect(root.querySelector('[data-fk-anchor="count"]')!.textContent).toBe('0')

    // Hand-over before lazy resolves flushes both presses in exact FIFO order
    const snap = claimBinder()!.take()
    expect(snap.queued).toEqual([
      { _tag: 'LazyAdd', by: 10 },
      { _tag: 'Inc', by: 1 },
    ])
    // Resolving after stop() does nothing
    resolveLazy({ tag: 'LazyAdd', schema: IncInput, transition: incTransition })
  })
})
