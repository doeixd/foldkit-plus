/**
 * The writer, in process. It is the one that decides a save: a title that is
 * blank is refused with the reason the client shows beside the field. The
 * client reads no rule of its own, so what the page and an agent are told
 * comes from here alone. `hold` makes it answer only when told, so a test
 * sees a save pending before the server has decided.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { RemoteClient, RemoteMutationError } from 'foldkit-remote'
import { SaveNote } from './app.js'

/** What a held save is answered with: the writer's own decision, or a transport that fails. */
export type Answer = 'writer' | 'down'

export interface Server {
  readonly layer: Layer.Layer<RemoteClient>
  /** Saves received and not yet answered. */
  readonly waiting: () => number
  /** From now on, saves wait for `answer`. */
  readonly hold: () => void
  /** Answers the oldest waiting save, or every later one at once with `release`. */
  readonly answer: (how: Answer) => void
  readonly release: () => void
  /** Every title the writer has decided on, in order. */
  readonly decided: () => ReadonlyArray<string>
}

export const makeServer = (): Server => {
  let holding = false
  const queue: Array<(how: Answer) => void> = []
  const decided: Array<string> = []

  const write = (request: { readonly input: unknown }, how: Answer) => {
    if (how === 'down') return Effect.fail(new RemoteMutationError({ message: 'offline' }))
    const input = Schema.decodeUnknownSync(SaveNote.Input)(request.input)
    decided.push(input.title)
    return input.title.trim() === ''
      ? Effect.fail(
          new RemoteMutationError({
            message: 'refused',
            refusal: { _tag: 'Field', key: 'title', reason: 'A title is required.' },
          }),
        )
      : Effect.succeed({
          output: { id: input.id },
          entities: [{ entity: 'Note', id: input.id, values: { title: input.title } }],
        })
  }

  const layer = Layer.succeed(RemoteClient, {
    read: () => Effect.die('the editor reads nothing'),
    query: () => Effect.die('the editor lists nothing'),
    mutate: request =>
      holding
        ? Effect.callback(resume => {
            queue.push(how => resume(write(request, how)))
          })
        : write(request, 'writer'),
    live: () => Stream.empty,
  })

  return {
    layer,
    waiting: () => queue.length,
    hold: () => {
      holding = true
    },
    answer: how => queue.shift()?.(how),
    release: () => {
      holding = false
      for (const answer of queue.splice(0)) answer('writer')
    },
    decided: () => decided,
  }
}
