/**
 * A shared host in a real browser, since its liveness is Web Locks: a page's
 * conversations reach the host decoded, with a port that reaches the page;
 * a message that is not an opening, or has no port, or comes from another
 * origin, reaches nothing; and a conversation ends when its page's lock is
 * released, no other with it.
 */
import { Schema } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SharedHost, type Conversation } from '../src/net/index.js'

const Opening = Schema.Union([
  Schema.TaggedStruct('Sync', { device: Schema.String }),
  Schema.TaggedStruct('Remote', {}),
])
type Opening = typeof Opening.Type

let hosts = 0
/** A host of its own, and every conversation its host is handed. */
const fresh = () => {
  const shared = SharedHost.define({ name: `test-${(hosts += 1)}`, opening: Opening })
  const handed: Array<{ readonly opening: Opening; readonly conversation: Conversation }> = []
  let starts = 0
  const start = () => {
    starts += 1
    return (opening: Opening, conversation: Conversation) => {
      handed.push({ opening, conversation })
    }
  }
  return { shared, handed, start, starts: () => starts }
}

/** A page's connection to `serve`, through a stand-in for the SharedWorker's port. */
const throughWorker = (
  shared: SharedHost<Opening>,
  start: () => (o: Opening, c: Conversation) => void,
) => {
  shared.serve(start)
  const { port1, port2 } = new MessageChannel()
  self.dispatchEvent(new MessageEvent('connect', { ports: [port2] }))
  return {
    connection: shared.connect({ worker: () => ({ port: port1 }), inPage: start }),
    port: port1,
  }
}

const firstMessage = (port: MessagePort): Promise<unknown> =>
  new Promise(resolve => {
    port.addEventListener('message', event => resolve(event.data), { once: true })
    port.start()
  })

const settle = () => new Promise(resolve => setTimeout(resolve, 50))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SharedHost', () => {
  it('hands the host each opening, decoded, with a port that reaches the page', async () => {
    const { shared, handed, start } = fresh()
    const { connection } = throughWorker(shared, start)
    const page = connection.open({ _tag: 'Sync', device: 'a' })
    await expect.poll(() => handed.length).toBe(1)
    expect(handed[0]!.opening).toEqual({ _tag: 'Sync', device: 'a' })
    const heard = firstMessage(page)
    handed[0]!.conversation.port.postMessage('hello')
    expect(await heard).toBe('hello')
    // The page holds its lock before the host asks for it, so it is not ended at birth.
    await settle()
    expect(handed[0]!.conversation.signal.aborted).toBe(false)
  })

  it('ignores what is not an opening, an opening without a port, and another host’s', async () => {
    const { shared, handed, start } = fresh()
    const { port } = throughWorker(shared, start)
    const opening = { _tag: 'Remote' }
    port.postMessage({ nonsense: true }, [new MessageChannel().port2])
    port.postMessage({ host: shared.name, conversation: 'c1', opening })
    port.postMessage({ host: 'another', conversation: 'c2', opening }, [new MessageChannel().port2])
    port.postMessage({ host: shared.name, conversation: 'c3', opening: { _tag: 'Sync' } }, [
      new MessageChannel().port2,
    ])
    await settle()
    expect(handed).toEqual([])
    port.postMessage({ host: shared.name, conversation: 'c4', opening }, [
      new MessageChannel().port2,
    ])
    await expect.poll(() => handed.length).toBe(1)
  })

  it('without SharedWorker, starts the host in this document once, when first needed', async () => {
    vi.stubGlobal('SharedWorker', undefined)
    const { shared, handed, start, starts } = fresh()
    const connection = shared.connect({
      worker: () => {
        throw new Error('no worker without SharedWorker')
      },
      inPage: start,
    })
    expect(starts()).toBe(0)
    connection.open({ _tag: 'Remote' })
    connection.open({ _tag: 'Sync', device: 'b' })
    await expect.poll(() => handed.length).toBe(2)
    expect(starts()).toBe(1)
    expect(handed.map(({ opening }) => opening)).toEqual([
      { _tag: 'Remote' },
      { _tag: 'Sync', device: 'b' },
    ])
  })

  it('takes a frame’s opening at the top document only from its own origin', async () => {
    vi.stubGlobal('SharedWorker', undefined)
    const { shared, handed, start } = fresh()
    shared.connect({ worker: () => ({ port: new MessageChannel().port1 }), inPage: start })
    const posted = (origin: string) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin,
          data: { host: shared.name, conversation: origin, opening: { _tag: 'Remote' } },
          ports: [new MessageChannel().port2],
        }),
      )
    posted('https://elsewhere.example')
    await settle()
    expect(handed).toEqual([])
    posted(location.origin)
    await expect.poll(() => handed.length).toBe(1)
  })

  it('ends a conversation when its page’s lock is released, and no other', async () => {
    const { shared, handed, start } = fresh()
    const { port } = throughWorker(shared, start)
    // What a page does for each conversation: holds its lock while it lives.
    const held = (conversation: string) =>
      new Promise<() => void>(granted => {
        void navigator.locks.request(
          `foldkit-shared-host:${shared.name}:${conversation}`,
          () => new Promise<void>(release => granted(release)),
        )
      })
    const releaseLeft = await held('left')
    await held('right')
    for (const conversation of ['left', 'right'])
      port.postMessage({ host: shared.name, conversation, opening: { _tag: 'Remote' } }, [
        new MessageChannel().port2,
      ])
    await expect.poll(() => handed.length).toBe(2)
    const [left, right] = handed.map(({ conversation }) => conversation.signal)
    await settle()
    expect([left!.aborted, right!.aborted]).toEqual([false, false])
    releaseLeft()
    await expect.poll(() => left!.aborted).toBe(true)
    await settle()
    expect(right!.aborted).toBe(false)
  })
})
