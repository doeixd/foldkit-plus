/**
 * Clipboard copy as a Command: runs in `update` beside any bundle, yields
 * `Copied` on success and `CopyFailed` otherwise. No Model involved: the
 * clipboard is not application state.
 */
import { Effect, Schema } from 'effect'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'

export const ClipboardMessage = defineMessageUnion({
  Copied: {},
  CopyFailed: { message: Schema.String },
})
export type ClipboardMessage = typeof ClipboardMessage.Type

const failMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Copies text to the clipboard. Without a clipboard API (SSR, insecure
 * context, denied permission) the command yields `CopyFailed` instead of
 * throwing, so `update` handles both outcomes as Messages.
 */
export const copyText = (text: string): Command<ClipboardMessage, never, never> => ({
  name: 'Clipboard.copy',
  args: { text },
  effect:
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
      ? Effect.matchEffect(
          Effect.tryPromise({
            try: () => navigator.clipboard.writeText(text),
            catch: failMessage,
          }),
          {
            onFailure: message => Effect.succeed(ClipboardMessage.CopyFailed({ message })),
            onSuccess: () => Effect.succeed(ClipboardMessage.Copied()),
          },
        )
      : Effect.succeed(ClipboardMessage.CopyFailed({ message: 'clipboard is unavailable' })),
})
