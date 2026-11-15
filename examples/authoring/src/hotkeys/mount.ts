import { Option, Stream } from 'effect'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import type { HtmlBuilder } from 'foldkit/html'
import { keyboardEvents, type KeyboardMessage } from 'foldkit-primitives/events'
import { platformFromUA, type Platform } from 'foldkit-primitives/media'
import { Message, Model, chordOf, initialOf, update } from './app.js'
import { editorView } from './view.js'

export interface HotkeysOptions {
  /** What `mod` means. Default: read from the browser's user agent. */
  readonly platform?: Platform
  /** The time stamped on each edit; a test passes its own so a pause is not a sleep. */
  readonly now?: () => number
}

/** The editor in `container`, with its shortcuts listening on the window. */
export const mountHotkeys = (container: HTMLElement, options: HotkeysOptions = {}) => {
  const platform = options.platform ?? platformFromUA(navigator.userAgent)
  const view = editorView(options.now ?? (() => performance.now()))
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => initialOf(platform),
      update,
      view: (model: Model, h: HtmlBuilder<Message>) => view(model, h),
      subscriptions: Subscription.make<Model, Message>()(() => ({
        keys: Subscription.persistentEntry(
          // The press is a shortcut or it is not: only a shortcut has its default (the
          // browser's own undo in the field) cancelled.
          keyboardEvents({ preventDefault: press => Option.isSome(chordOf(platform, press)) }).pipe(
            Stream.filter(
              (message): message is Extract<KeyboardMessage, { readonly _tag: 'Pressed' }> =>
                message._tag === 'Pressed',
            ),
            Stream.map(({ _tag, ...press }) => Message.Pressed(press)),
          ),
        ),
      })),
    }),
  )
}
