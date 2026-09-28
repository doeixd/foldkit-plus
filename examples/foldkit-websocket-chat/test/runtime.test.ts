// @vitest-environment jsdom
/**
 * The whole application on the real runtime, with the socket bundle's
 * default `new WebSocket(url)` answered by a fake: nothing reaches the
 * network, and the page sees only what a browser socket would report.
 */
import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { Model, init, managedResources, subscriptions, update, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { FakeSocket } from './fixtures.js'

afterEach(() => {
  FakeSocket.made.length = 0
  vi.unstubAllGlobals()
  document.head.replaceChildren()
  document.body.replaceChildren()
})

const run = () => {
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  Style.install(stylesheet)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  Runtime.run(
    Runtime.makeApplication({
      Model,
      init,
      update,
      view,
      subscriptions,
      managedResources,
      container,
    }),
  )
}

const buttonNamed = (name: string): HTMLButtonElement => {
  const found = Array.from(document.querySelectorAll('button')).find(
    button => button.textContent === name,
  )
  if (found === undefined) throw new Error(`no ${name} button`)
  return found
}

const messageInput = (): HTMLInputElement => {
  const found = document.querySelector<HTMLInputElement>('input[placeholder="Type a message..."]')
  if (found === null) throw new Error('no message input')
  return found
}

const text = (): string => document.body.textContent ?? ''

const bubbles = (): ReadonlyArray<string> =>
  Array.from(document.querySelectorAll('li')).map(
    item => `${item.getAttribute('data-state')}: ${item.querySelector('p')?.textContent}`,
  )

/** Starts the page, clicks Connect, and returns the socket it made. */
const connect = async (): Promise<FakeSocket> => {
  run()
  await vi.waitFor(() => buttonNamed('Connect to Chat'))
  buttonNamed('Connect to Chat').click()
  await vi.waitFor(() => expect(FakeSocket.made).toHaveLength(1))
  return FakeSocket.made[0]!
}

/** Connects and opens the socket, then waits for the message input. */
const connected = async (): Promise<FakeSocket> => {
  const socket = await connect()
  socket.open()
  await vi.waitFor(messageInput)
  return socket
}

describe('the chat on the runtime', () => {
  test('makes no socket until Connect is clicked, then connects to the echo server', async () => {
    run()
    await vi.waitFor(() => buttonNamed('Connect to Chat'))
    expect(FakeSocket.made).toEqual([])

    buttonNamed('Connect to Chat').click()
    await vi.waitFor(() => expect(FakeSocket.made).toHaveLength(1))
    expect(FakeSocket.made[0]!.url).toBe('wss://ws.postman-echo.com/raw')
    await vi.waitFor(() => expect(text()).toContain('Connecting...'))

    FakeSocket.made[0]!.open()
    await vi.waitFor(messageInput)
    expect(text()).toContain('Connected')
  })

  test('sends what is typed, shows it, and shows the echo', async () => {
    const socket = await connected()

    messageInput().value = '  hi there  '
    messageInput().dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() =>
      expect(buttonNamed('Send').getAttribute('aria-disabled')).not.toBe('true'),
    )
    buttonNamed('Send').click()

    await vi.waitFor(() => expect(socket.sent).toEqual(['hi there']))
    await vi.waitFor(() => expect(bubbles()).toEqual(['sent: hi there']))
    expect(messageInput().value).toBe('')

    socket.receive('hi there')
    await vi.waitFor(() => expect(bubbles()).toEqual(['sent: hi there', 'received: hi there']))

    // Every class drawn has its CSS.
    const css = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent)
      .join('')
    const drawn = Array.from(document.querySelectorAll('[class]')).flatMap(element =>
      Array.from(element.classList),
    )
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.filter(className => !css.includes(`.${className}`))).toEqual([])
  })

  test('a server that drops the socket returns to Disconnected and clears the conversation', async () => {
    const socket = await connected()
    socket.receive('before the drop')
    await vi.waitFor(() => expect(bubbles()).toHaveLength(1))

    socket.close()
    await vi.waitFor(() => buttonNamed('Connect to Chat'))
    expect(text()).toContain('Disconnected')
    expect(text()).toContain('No messages yet')
  })

  test.each([
    ['before it opens', connect, 'Failed to connect to WebSocket'],
    ['after it opened', connected, 'Connection error'],
  ])(
    'a socket that fails %s shows the error, closes, and Try Again makes a new one',
    async (_, start, error) => {
      const socket = await start()
      socket.fail()

      await vi.waitFor(() => expect(text()).toContain('Connection Error'))
      expect(text()).toContain(error)
      expect(socket.readyState).toBe(3)

      buttonNamed('Try Again').click()
      await vi.waitFor(() => expect(FakeSocket.made).toHaveLength(2))
      await vi.waitFor(() => expect(text()).toContain('Connecting...'))
    },
  )
})
