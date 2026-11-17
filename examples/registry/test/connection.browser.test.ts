/**
 * A device's connection strip in Chromium: the button keeps focus when it is
 * pressed (the page redraws its label, and a redrawn button that lost focus
 * would drop a keyboard user to the body), the status line is a live region
 * that changes, and the notices a refusal adds land in regions announced
 * politely. The page is mounted over a server that never answers: nothing
 * here reads a row.
 */
import { Effect, Layer, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { Remote, type RemoteRpcClient } from 'foldkit-remote'
import { ReplicaId, type Storage } from 'foldkit-sync'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Message } from '../src/app.js'
import { ProductId } from '../src/domain.js'
import { stylesheet } from '../src/style.js'
import { RegistrySync, mountRegistry } from '../src/sync.js'

const silent: RemoteRpcClient = {
  FoldkitRemoteRead: () => Effect.never,
  FoldkitRemoteQuery: () => Effect.never,
  FoldkitRemoteMutate: () => Effect.never,
  FoldkitRemoteLive: () => Stream.never,
}

const memoryStorage = (): Storage => {
  let stored: unknown
  return {
    load: () => Effect.sync(() => stored),
    save: next => Effect.sync(() => (stored = structuredClone(next))),
    close: Effect.void,
  }
}

let dispose = async () => {}
afterEach(async () => {
  await dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = stylesheet
  document.head.append(sheet)
  const replica = await Effect.runPromise(
    RegistrySync.openReplica(memoryStorage(), { replicaId: ReplicaId.make('tab-1') }),
  )
  const container = document.createElement('div')
  container.id = 'registry-page'
  document.body.append(container)
  const mounted = mountRegistry(replica, {
    container,
    resources: Layer.merge(Remote.clientLayer(silent), KeyValueStore.layerMemory),
    device: 'tab-1',
  })
  dispose = mounted.dispose
  return mounted.mounted
}

const connection = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('header button')).find(button =>
    /^Go (offline|online)$/.test(button.textContent ?? ''),
  )

it('keeps focus on the button it is pressed on, and says the new state in the status line', async () => {
  await mount()
  await vi.waitFor(() => expect(connection()).toBeDefined())
  const status = () => document.getElementById('exchange')
  expect(status()?.getAttribute('role')).toBe('status')
  connection()!.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(connection()?.textContent).toBe('Go online'))
  expect(document.activeElement).toBe(connection())
  expect(status()?.textContent).toBe('Offline: edits are kept on this device')
  expect(status()?.querySelector('[data-link]')?.getAttribute('data-link')).toBe('offline')
  await userEvent.keyboard(' ')
  await vi.waitFor(() => expect(connection()?.textContent).toBe('Go offline'))
  expect(document.activeElement).toBe(connection())
})

it('announces a refused edit in a polite region that was already in the page', async () => {
  const mounted = await mount()
  await vi.waitFor(() => expect(connection()).toBeDefined())
  const region = document.getElementById('refused')
  expect(region?.getAttribute('aria-live')).toBe('polite')
  expect(region?.textContent).toBe('')
  mounted.dispatch(
    Message.EditsRefused({
      refusals: [
        {
          opId: 'op1',
          id: ProductId.make('p000001'),
          column: 'cents',
          reason: 'A price, like 4.99',
        },
      ],
    }),
  )
  await vi.waitFor(() => expect(region?.textContent).toContain('A price, like 4.99'))
  // The same element: a region replaced by the redraw would announce nothing.
  expect(document.getElementById('refused')).toBe(region)
})
