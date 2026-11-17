import type { SocketLike } from 'foldkit-sync'
import { describe, expect, it } from 'vitest'
import { makeNetwork } from '../src/network.js'

/** A socket that records what it was asked, and closes the way a real one does. */
const fakeSocket = () => {
  const closers = new Set<() => void>()
  const sent: Array<string> = []
  let closes = 0
  const socket: SocketLike = {
    send: data => {
      sent.push(data)
    },
    close: () => {
      closes += 1
      for (const listener of [...closers]) listener()
    },
    onOpen: listener => {
      listener()
      return () => {}
    },
    onMessage: () => () => {},
    onClose: listener => {
      closers.add(listener)
      return () => closers.delete(listener)
    },
  }
  return { socket, sent, closes: () => closes }
}

describe('the network switch', () => {
  it('hands the transport the real socket while online', () => {
    const network = makeNetwork()
    const real = fakeSocket()
    const socket = network.socket(() => real.socket)()
    socket.send('hello')
    expect(real.sent).toEqual(['hello'])
  })

  it('going offline closes the live socket, and the next one never opens or sends', () => {
    const network = makeNetwork()
    const real = fakeSocket()
    const closed: Array<string> = []
    const open = network.socket(() => real.socket)
    open().onClose(() => closed.push('live'))
    network.set(true)
    expect(real.closes()).toBe(1)
    expect(closed).toEqual(['live'])

    const cut = open()
    let opened = false
    cut.onOpen?.(() => {
      opened = true
    })
    cut.send('lost')
    expect(opened).toBe(false)
    expect(real.sent).toEqual([])
  })

  it('going back online closes the waiting socket, so the transport asks for a new one', () => {
    const network = makeNetwork()
    const real = fakeSocket()
    const open = network.socket(() => real.socket)
    network.set(true)
    const cut = open()
    const closed: Array<string> = []
    cut.onClose(() => closed.push('cut'))
    network.set(false)
    expect(closed).toEqual(['cut'])
    open().send('again')
    expect(real.sent).toEqual(['again'])
  })

  it('a socket the transport already closed is not closed again', () => {
    const network = makeNetwork()
    const real = fakeSocket()
    const socket = network.socket(() => real.socket)()
    socket.close()
    network.set(true)
    expect(real.closes()).toBe(1)
  })

  it('setting the state it is already in does nothing', () => {
    const network = makeNetwork()
    const real = fakeSocket()
    network.socket(() => real.socket)()
    network.set(false)
    expect(real.closes()).toBe(0)
  })
})
