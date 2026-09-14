// @vitest-environment jsdom
import { Effect } from 'effect'
import { ReplicaId, type Storage } from 'foldkit-sync'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Message } from '../src/app.js'
import { mountApp } from '../src/runtime.js'
import { TodoSync } from '../src/sync.js'

/** A storage double, so the runtime can be mounted without IndexedDB. */
const memoryStorage = (): Storage => {
  let state: unknown
  return {
    load: () => Effect.sync(() => state),
    save: next =>
      Effect.sync(() => {
        state = structuredClone(next)
      }),
    close: Effect.void,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the mounted app', () => {
  it('reads the filter from the URL at start and writes it back as the filter changes', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    window.history.replaceState({}, '', '/?filter=active&sort=asc')
    const container = document.createElement('div')
    container.id = 'todo-app-mirrors'
    document.body.appendChild(container)
    const replica = await Effect.runPromise(
      TodoSync.openReplica(ReplicaId.make('mirrors'), memoryStorage()),
    )
    const mounted = mountApp(replica, container)
    try {
      await vi.waitFor(() => expect(mounted.model().filter).toBe('active'))
      mounted.dispatch(Message.FilterSelected({ filter: 'completed' }))
      await vi.waitFor(() => expect(window.location.search).toBe('?filter=completed&sort=asc'))
      // Back to the default drops the key and keeps the rest of the URL.
      mounted.dispatch(Message.FilterSelected({ filter: 'all' }))
      await vi.waitFor(() => expect(window.location.search).toBe('?sort=asc'))
      // A navigation reads back in.
      window.history.pushState({}, '', '/?filter=active')
      window.dispatchEvent(new PopStateEvent('popstate'))
      await vi.waitFor(() => expect(mounted.model().filter).toBe('active'))
    } finally {
      await mounted.dispose()
      await Effect.runPromise(replica.close)
      container.remove()
      window.history.replaceState({}, '', '/')
    }
  })

  it('applies an intent, persists the fact it minted, and renders through the slots', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)

    const container = document.createElement('div')
    container.id = 'todo-app-runtime'
    document.body.appendChild(container)

    const replica = await Effect.runPromise(
      TodoSync.openReplica(ReplicaId.make('test'), memoryStorage()),
    )
    const mounted = mountApp(replica, container)
    try {
      await vi.waitFor(() => expect(document.body.textContent).toContain('0 active'))

      // The intent is local; the fact its Command emits is what reaches the outbox.
      mounted.dispatch(Message.RequestedTodo({ title: 'From the UI' }))
      await vi.waitFor(() => expect(document.body.textContent).toContain('From the UI'))
      await vi.waitFor(() => expect(Effect.runSync(replica.pending)).toHaveLength(1))
      expect(Effect.runSync(replica.pending)[0]!.message).toMatchObject({ _tag: 'SubmittedTodo' })
      expect(document.body.textContent).toContain('1 active')

      // The row's checkbox is a `@foldkit/ui` Checkbox and the filter buttons
      // carry the Behavior's aria-selected, both resolved through slots.
      expect(document.querySelector('[role="checkbox"]')).not.toBeNull()
      expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(1)

      // Theme tokens landed on the root as custom properties.
      const root = container.querySelector<HTMLElement>('.app') ?? document.querySelector('.app')
      expect(root?.getAttribute('style')).toContain('--fk-color-accent')
    } finally {
      await mounted.dispose()
      await Effect.runPromise(replica.close)
      container.remove()
    }
  })
})
