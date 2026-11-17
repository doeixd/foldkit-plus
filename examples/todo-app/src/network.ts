/**
 * The sandbox's "go offline" switch, a gate in front of the Sync socket.
 *
 * Offline, the transport is handed a socket that never opens, so the replica's
 * exchanges wait and its edits queue in the outbox exactly as they would with
 * no network. Back online, the waiting socket is closed, the transport asks
 * for a new one, and the queued edits are sent.
 */
import type { SocketLike } from 'foldkit-sync'

export interface Network {
  /** Cuts the connection, or lets the transport reconnect. */
  readonly set: (offline: boolean) => void
  /** The factory the transport opens sockets with, through the gate. */
  readonly socket: (open: () => SocketLike) => () => SocketLike
}

export const makeNetwork = (): Network => {
  let offline = false
  // What `set` has to move: every socket handed out and not yet closed.
  const drops = new Set<() => void>()

  const connected = (open: () => SocketLike): SocketLike => {
    const real = open()
    const drop = (): void => real.close()
    drops.add(drop)
    return {
      ...real,
      close: () => {
        drops.delete(drop)
        real.close()
      },
      onClose: listener =>
        real.onClose(() => {
          drops.delete(drop)
          listener()
        }),
    }
  }

  const cut = (): SocketLike => {
    const closed = new Set<() => void>()
    const drop = (): void => {
      drops.delete(drop)
      for (const listener of [...closed]) listener()
    }
    drops.add(drop)
    return {
      send: () => {},
      close: () => {
        drops.delete(drop)
      },
      onOpen: () => () => {},
      onMessage: () => () => {},
      onClose: listener => {
        closed.add(listener)
        return () => closed.delete(listener)
      },
    }
  }

  return {
    set: next => {
      if (next === offline) return
      offline = next
      for (const drop of [...drops]) drop()
    },
    socket: open => () => (offline ? cut() : connected(open)),
  }
}
