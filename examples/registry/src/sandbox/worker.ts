/**
 * The sandbox's SharedWorker: one host for every tab of the sandbox, which
 * lives as long as one of them is open. Each connection posts the
 * conversations it opens, with their ports.
 */
import { Option, Schema } from 'effect'
import { openHost } from './host.js'
import { Opening } from './protocol.js'

// A SharedWorker's global, as far as this uses it: the DOM library this
// project compiles with has no SharedWorkerGlobalScope.
declare const self: {
  addEventListener(type: 'connect', listener: (event: MessageEvent) => void): void
}

const host = openHost()
const decodeOpening = Schema.decodeUnknownOption(Opening)

self.addEventListener('connect', event => {
  const [connection] = event.ports
  connection?.addEventListener('message', message => {
    const [port] = message.ports
    // A message that is no opening, or has no port, is not a pane's: ignored.
    Option.match(
      Option.zipWith(
        decodeOpening(message.data),
        Option.fromUndefinedOr(port),
        (opening, given) => ({ opening, given }),
      ),
      {
        onNone: () => {},
        onSome: ({ opening, given }) => {
          void host.then(started => started.connect(opening, given))
        },
      },
    )
  })
  connection?.start()
})
