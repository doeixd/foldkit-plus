/**
 * One server in the browser for many documents: every tab and frame of an
 * application meets the same host. A page opens conversations, each a
 * `MessagePort` with a decoded opening that says what it is for; the host, in
 * a SharedWorker shared by every tab, or in the top document where there is no
 * SharedWorker, is handed each one with a signal that aborts when the page
 * that opened it is gone.
 *
 * It owns the host's lifetime and the routing of conversations, nothing
 * spoken over them: Sync's `portSocket` and Remote's `port` do that.
 */
import { Option, Schema } from 'effect'

/** One conversation a page opened: its port, and a signal that aborts once the page is gone. */
export interface Conversation {
  readonly port: MessagePort
  readonly signal: AbortSignal
}

/** What the host does with each conversation, told what the page opened it for. */
export type ConversationHandler<Opening> = (opening: Opening, conversation: Conversation) => void

/** Starts the host, once, the first time a conversation needs it. */
export type StartHost<Opening> = () =>
  ConversationHandler<Opening> | Promise<ConversationHandler<Opening>>

export interface SharedHostOptions<Opening> {
  /**
   * The SharedWorker whose entry calls `serve`. Constructed by the
   * application, since a bundler finds a worker only in a literal
   * `new SharedWorker(new URL('./worker.ts', import.meta.url), …)`.
   */
  readonly worker: () => { readonly port: MessagePort }
  /** The host, for a browser without SharedWorker: started in the top document. */
  readonly inPage: StartHost<Opening>
}

/** A page's way to the host. */
export interface SharedHostConnection<Opening> {
  /** Opens a conversation for `opening`, returning the page's end of it. */
  readonly open: (opening: Opening) => MessagePort
}

export interface SharedHost<Opening> {
  readonly name: string
  /** A SharedWorker's entry: hands the host every conversation a page opens. */
  readonly serve: (start: StartHost<Opening>) => void
  /**
   * A page's connection: through the SharedWorker, or, without one, to the
   * host in the top document. Call it in the top document too when that
   * document frames the pages, so that it is the one the frames meet.
   */
  readonly connect: (options: SharedHostOptions<Opening>) => SharedHostConnection<Opening>
}

/**
 * A shared host: its `name`, which keeps two on one origin apart, and
 * the schema of what opens a conversation, which the host decodes before
 * anything else, ignoring a message that does not decode.
 */
const define = <Opening, Encoded>(options: {
  readonly name: string
  readonly opening: Schema.Codec<Opening, Encoded, never, never>
}): SharedHost<Opening> => {
  const { name } = options
  const Envelope = Schema.Struct({
    host: Schema.Literal(name),
    conversation: Schema.String,
    opening: options.opening,
  })
  const encode = Schema.encodeSync(Envelope)
  const decode = Schema.decodeUnknownOption(Envelope)
  const lockOf = (conversation: string) => `foldkit-shared-host:${name}:${conversation}`
  const marker = `foldkit-shared-host:${name}`

  const receive = (
    host: () => Promise<ConversationHandler<Opening>>,
    data: unknown,
    port: MessagePort | undefined,
  ) =>
    Option.match(
      Option.zipWith(decode(data), Option.fromUndefinedOr(port), (envelope, given) => ({
        envelope,
        given,
      })),
      {
        // Not a page's opening, or one without its port: nothing to answer.
        onNone: () => {},
        onSome: ({ envelope, given }) => {
          const ended = new AbortController()
          // The page holds this lock while it lives, so the host is granted it
          // when the page's document unloads or crashes.
          Option.match(locks(), {
            onNone: () => {},
            onSome: held => {
              void held.request(lockOf(envelope.conversation), () => ended.abort())
            },
          })
          void host()
            .then(started => started(envelope.opening, { port: given, signal: ended.signal }))
            .catch(reportError)
        },
      },
    )

  const once = (start: StartHost<Opening>): (() => Promise<ConversationHandler<Opening>>) => {
    let started: Promise<ConversationHandler<Opening>> | undefined
    return () => (started ??= Promise.resolve().then(start))
  }

  const serve = (start: StartHost<Opening>): void => {
    const host = once(start)
    self.addEventListener('connect', event => {
      if (!(event instanceof MessageEvent)) return
      const [connection] = event.ports
      connection?.addEventListener('message', message =>
        receive(host, message.data, message.ports[0]),
      )
      connection?.start()
    })
  }

  const connect = ({
    worker,
    inPage,
  }: SharedHostOptions<Opening>): SharedHostConnection<Opening> => {
    const send = routeOf(worker, inPage)
    return {
      open: opening => {
        const { port1, port2 } = new MessageChannel()
        const conversation = crypto.randomUUID()
        const envelope = encode({ host: name, conversation, opening })
        // The opening goes once the lock is held, so the host cannot be
        // granted it first and end the conversation before it began.
        void hold(lockOf(conversation)).then(() => send(envelope, port2))
        return port1
      },
    }
  }

  const routeOf = (
    worker: SharedHostOptions<Opening>['worker'],
    inPage: StartHost<Opening>,
  ): ((envelope: unknown, port: MessagePort) => void) => {
    if (typeof SharedWorker !== 'undefined') {
      const { port } = worker()
      return (envelope, given) => port.postMessage(envelope, [given])
    }
    return Option.match(acceptingTop(marker), {
      onSome: top => (envelope, given) => top.postMessage(envelope, location.origin, [given]),
      onNone: () => {
        const host = once(inPage)
        Reflect.set(window, marker, true)
        window.addEventListener('message', event => {
          if (event.origin === location.origin) receive(host, event.data, event.ports[0])
        })
        return (envelope, given) => receive(host, envelope, given)
      },
    })
  }

  return { name, serve, connect }
}

/** The top document, when it is another of this origin's and runs this host. */
const acceptingTop = (marker: string): Option.Option<Window> => {
  const top = window.top
  if (top === null || top === window) return Option.none()
  try {
    return Reflect.get(top, marker) === true ? Option.some(top) : Option.none()
  } catch {
    // Another origin's top document: reading it throws.
    return Option.none()
  }
}

/** Resolves once this document holds `lock`, which it then holds while it lives. */
const hold = (lock: string): Promise<void> =>
  Option.match(locks(), {
    onNone: () => Promise.resolve(),
    onSome: held =>
      new Promise(granted => {
        void held.request(lock, () => {
          granted()
          return new Promise(() => {})
        })
      }),
  })

/** Web Locks, which a page outside a secure context, or an older browser, lacks. */
const locks = (): Option.Option<LockManager> => Option.fromUndefinedOr(navigator.locks)

export const SharedHost = { define }
