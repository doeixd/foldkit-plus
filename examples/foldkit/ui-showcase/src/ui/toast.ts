import { Schema } from 'effect'

import { Toast as UiToast } from '@foldkit/ui'

/** Payload shape for the showcase's toast stack. Consumer decides what goes
 *  in each entry; the Toast component owns only lifecycle and a11y. */
export const ToastPayload = Schema.Struct({
  title: Schema.String,
  maybeDescription: Schema.Option(Schema.String),
})
export type ToastPayload = typeof ToastPayload.Type

// Annotated because the inferred type names a `foldkit` internal module, which
// a composite project cannot emit a declaration for.
export const Toast: ReturnType<typeof UiToast.make<ToastPayload, typeof ToastPayload.Encoded>> =
  UiToast.make(ToastPayload)
