/**
 * Web Share as a Command: runs in `update` beside any bundle, yields
 * `Shared` on success. Dismissal is its own outcome, not a failure — the
 * application tells a cancelled sheet apart from a broken one. Without a
 * share API (desktop, insecure context) it yields `ShareFailed` instead of
 * throwing, so `update` handles every outcome as a Message.
 */
import { Effect, Schema } from 'effect'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'

export const ShareData = Schema.Struct({
  title: Schema.optional(Schema.String),
  text: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
})
export type ShareData = typeof ShareData.Type

export const ShareMessage = defineMessageUnion({
  Shared: {},
  Dismissed: {},
  ShareFailed: { message: Schema.String },
})
export type ShareMessage = typeof ShareMessage.Type

const failMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const isDismissal = (error: unknown): boolean =>
  typeof (error as { readonly name?: unknown } | null)?.name === 'string' &&
  (error as { readonly name: string }).name === 'AbortError'

/** Shares data through the platform sheet. */
export const share = (data: ShareData): Command<ShareMessage, never, never> => ({
  name: 'Share.share',
  args: { data },
  effect:
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      ? Effect.matchEffect(
          Effect.tryPromise({
            // Omit absent fields: the platform type rejects explicit
            // undefined under exactOptionalPropertyTypes.
            try: () =>
              navigator.share({
                ...(data.title !== undefined ? { title: data.title } : {}),
                ...(data.text !== undefined ? { text: data.text } : {}),
                ...(data.url !== undefined ? { url: data.url } : {}),
              }),
            catch: (error: unknown) => error,
          }),
          {
            onFailure: error =>
              Effect.succeed(
                isDismissal(error)
                  ? ShareMessage.Dismissed()
                  : ShareMessage.ShareFailed({ message: failMessage(error) }),
              ),
            onSuccess: () => Effect.succeed(ShareMessage.Shared()),
          },
        )
      : Effect.succeed(ShareMessage.ShareFailed({ message: 'share is unavailable' })),
})
