// @vitest-environment jsdom
/**
 * The live slider and tooltip on the real Foldkit runtime: each Submodel
 * mounts, and interaction reaches the Model-owned value through the fold.
 */
import { afterEach, expect, it, vi } from 'vitest'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { initialModel, Message, Model, update, view } from '../src/main.js'
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
    init: () => ({ model: initialModel }),
    update,
    view: (model: Model, h: HtmlBuilder<Message>) => view(model, h).body,
    subscriptions,
    container,
  })
  const handle = Runtime.embed(program)
  return { dispose: () => handle.dispose() }
}

const thumb = (): HTMLElement | null => document.querySelector('[role="slider"]')

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

it('steps the owned volume from the thumb keyboard', async () => {
  const mounted = mount()
  try {
    await settleFor(() => expect(thumb()?.getAttribute('aria-valuenow')).toBe('60'))
    expect(document.body.textContent).toContain('Volume: 60')
    thumb()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await settleFor(() => expect(thumb()?.getAttribute('aria-valuenow')).toBe('65'))
    await settleFor(() => expect(document.body.textContent).toContain('Volume: 65'))
  } finally {
    mounted.dispose()
  }
})
