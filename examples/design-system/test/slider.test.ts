// @vitest-environment jsdom
/**
 * The live slider on the real Foldkit runtime: the Submodel mounts, its
 * thumb carries the slider role and value, and an arrow key steps the
 * Model-owned value through ChangedValue (drag subscriptions attached, none
 * in flight).
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

const thumb = (): HTMLElement | null => document.querySelector('[role="slider"]')

it('steps the owned volume from the thumb keyboard', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  // The runtime renders into its container by id.
  container.id = 'design-system-volume'
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
  try {
    await vi.waitFor(() => expect(thumb()?.getAttribute('aria-valuenow')).toBe('60'))
    expect(document.body.textContent).toContain('Volume: 60')
    thumb()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await vi.waitFor(() => expect(thumb()?.getAttribute('aria-valuenow')).toBe('65'))
    await vi.waitFor(() => expect(document.body.textContent).toContain('Volume: 65'))
  } finally {
    handle.dispose()
  }
})
