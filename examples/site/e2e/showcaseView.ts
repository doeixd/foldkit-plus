/**
 * One showcase's first preview as an application view, for `parity.e2e.ts`: the server renders it in
 * Node, the runtime draws it in Chromium, and the two are compared. Both take the same Model
 * (none) and the same `Live`, so a difference is the environment's.
 */
import type { Document, Html, HtmlBuilder } from 'foldkit/html'

import { showcaseOf } from '../src/gallery/showcases.js'
import * as Examples from '../src/gallery/examplesState.js'
import * as Widgets from '../src/gallery/widgets.js'
import { Option } from 'effect'

interface Msg {
  readonly _tag: string
}
const msg: Msg = { _tag: 'ignored' }

/** The preview alone, which the runtime draws. */
export const previewOf =
  (slug: string) =>
  (_: unknown, h: HtmlBuilder<Msg>): Html =>
    h.div(
      [],
      [
        Option.getOrThrow(showcaseOf(slug)).preview(
          {},
          {
            switched: false,
            onSwitch: () => msg,
            chosen: 'team',
            onChoose: () => msg,
            dismissed: false,
            onDismiss: msg,
            onRestore: msg,
            direction: 'ltr',
            widgets: Widgets.initial,
            onWidget: () => msg,
            examples: Examples.initial,
            onExample: () => msg,
            // The first draw: the page has not been taken over.
            ready: false,
            h,
          },
        ),
      ],
    )

/** The same, as the document the server renders. */
export const viewOf =
  (slug: string) =>
  (model: unknown, h: HtmlBuilder<Msg>): Document => ({
    title: slug,
    body: previewOf(slug)(model, h),
  })

export { showcases } from '../src/gallery/showcases.js'
