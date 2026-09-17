/**
 * Fullscreen as Commands plus an entry — not a bundle, because the document
 * owns the state: `document.fullscreenElement` is the fact, and the entry
 * reports it as `Changed`. Commands yield `Entered`/`Exited` on success and
 * `Failed` otherwise (rejected request, missing API), so `update` handles
 * both outcomes as Messages.
 */
import { Effect, Schema, Stream } from 'effect'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'

export const FullscreenMessage = defineMessageUnion({
  Changed: { active: Schema.Boolean },
  Entered: {},
  Exited: {},
  Failed: { message: Schema.String },
})
export type FullscreenMessage = typeof FullscreenMessage.Type

const failMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Requests fullscreen for an element. The capability is feature-checked on
 * the element itself (SVG and HTML elements both qualify), so a platform
 * without it yields `Failed` instead of throwing.
 */
export const enterFullscreen = (element: Element): Command<FullscreenMessage, never, never> => ({
  name: 'Fullscreen.enter',
  args: {},
  effect: Effect.matchEffect(
    Effect.tryPromise({
      try: () => {
        const requestable = element as unknown as {
          readonly requestFullscreen?: unknown
        }
        if (typeof requestable.requestFullscreen !== 'function') {
          throw new Error('fullscreen is unavailable')
        }
        return (requestable.requestFullscreen as () => Promise<void>).call(element)
      },
      catch: (error: unknown) => error,
    }),
    {
      onFailure: error => Effect.succeed(FullscreenMessage.Failed({ message: failMessage(error) })),
      onSuccess: () => Effect.succeed(FullscreenMessage.Entered()),
    },
  ),
})

/** Leaves fullscreen. Without a document API it yields `Failed`, not a throw. */
export const exitFullscreen = (): Command<FullscreenMessage, never, never> => ({
  name: 'Fullscreen.exit',
  args: {},
  effect: Effect.matchEffect(
    Effect.tryPromise({
      try: () => {
        if (typeof document === 'undefined' || typeof document.exitFullscreen !== 'function') {
          throw new Error('fullscreen is unavailable')
        }
        return document.exitFullscreen()
      },
      catch: (error: unknown) => error,
    }),
    {
      onFailure: error => Effect.succeed(FullscreenMessage.Failed({ message: failMessage(error) })),
      onSuccess: () => Effect.succeed(FullscreenMessage.Exited()),
    },
  ),
})

/**
 * `Changed` whenever fullscreen state flips, starting with the current
 * answer. Without a document the stream is empty instead of throwing.
 */
export const fullscreenChanges = (): Stream.Stream<FullscreenMessage> => {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return Stream.empty
  }
  // Incomplete DOMs leave fullscreenElement undefined instead of null.
  const isActive = (): boolean =>
    document.fullscreenElement !== null && document.fullscreenElement !== undefined
  return Stream.concat(
    Stream.make(FullscreenMessage.Changed({ active: isActive() })),
    Stream.fromEventListener(document, 'fullscreenchange').pipe(
      Stream.map(() => FullscreenMessage.Changed({ active: isActive() })),
    ),
  )
}
