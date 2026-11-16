/** The drawings that more than one showcase shares. */
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Widgets from './widgets.js'
import * as Fields from './fields.js'
import type { Live } from './showcase.js'

/** A Message of the field previews, as the page sends it. */
export const fields = <Message>(live: Live<Message>, message: Fields.Message): Message =>
  live.onWidget(Widgets.Message.GotFields({ message }))

/**
 * A box of fixed height for what is drawn against the viewport. `transform` makes it the containing
 * block of a `position: fixed` descendant, so the Drawer docks to this frame and not to the window.
 */
export const frame = <Message>(
  h: HtmlBuilder<Message>,
  size: { readonly height: string; readonly overflow: 'hidden' | 'auto' },
  children: ReadonlyArray<Html>,
): Html =>
  h.div(
    [
      h.Style({
        position: 'relative',
        transform: 'translateZ(0)',
        blockSize: size.height,
        inlineSize: 'min(100%, 36rem)',
        overflow: size.overflow,
        border: '1px solid color-mix(in oklab, currentColor 20%, transparent)',
        borderRadius: '0.5rem',
        '--fk-drawer-height': '80%',
        '--fk-drawer-peek': '4.5rem',
      }),
    ],
    children,
  )
