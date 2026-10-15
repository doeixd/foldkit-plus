// @vitest-environment jsdom
/**
 * The live slider on the real Foldkit runtime: it mounts, and a value its
 * input reports reaches the Model and comes back drawn.
 */
import { afterEach, expect, it, vi } from 'vitest'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { initModel, Message, Model, update, view } from '../src/main.js'

const modelForTests = initModel({ year: 2026, month: 10, day: 8 })
import { subscriptions } from '../src/subscriptions.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const mount = (): { readonly dispose: () => void } => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  // The runtime renders into its container by id.
  container.id = 'design-system-live'
  document.body.appendChild(container)

  const program = Runtime.makeElement({
    Model,
    init: () => ({ model: modelForTests }),
    update,
    view: (model: Model, h: HtmlBuilder<Message>) => view(model, h).body,
    subscriptions,
    container,
  })
  const handle = Runtime.embed(program)
  return { dispose: () => handle.dispose() }
}

const thumb = (): HTMLInputElement | null => document.querySelector('#volume-slider-value')

/**
 * Polls `what` until it stops throwing. `vi.waitFor` never resolves in this
 * harness (its polling stalls while the runtime holds the loop), so the
 * retry is spelled out: each failed assertion waits 50ms and tries again.
 */
const settleFor = async (what: () => void, timeout = 8000): Promise<void> => {
  const start = Date.now()
  for (;;) {
    try {
      what()
      return
    } catch {
      // Retry until the timeout, then run once more to surface the error.
    }
    if (Date.now() - start > timeout) {
      what()
      return
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

// jsdom moves no native range on a key, so the test sends what a moved input sends.
it('keeps the volume its input reports, and shows it', async () => {
  const mounted = mount()
  try {
    await settleFor(() => expect(thumb()?.getAttribute('aria-valuetext')).toBe('60%'))
    thumb()!.value = '65'
    thumb()!.dispatchEvent(new Event('input', { bubbles: true }))
    await settleFor(() => expect(thumb()?.getAttribute('aria-valuetext')).toBe('65%'))
    await settleFor(() => expect(document.body.textContent).toContain('65%'))
  } finally {
    mounted.dispose()
  }
})
