import { SlotView, Style } from 'foldkit-mixins'

import { NotFoundSlots, NotFoundStyle } from './style.js'

export interface NotFoundInput {
  readonly path: string
  readonly backLinkHref: string
  readonly backLinkText: string
}

/**
 * The 404 page, for the Message universe of the Submodel that draws it. It
 * sends no Message; each Submodel makes its own once, at module load, because
 * a view is typed by the builder it is drawn with.
 */
export const makeNotFoundView = <Message>() =>
  SlotView.forMessages<Message>()
    .define(NotFoundSlots, (input: NotFoundInput, slots, h) =>
      h.div(slots.content.attrs(), [
        h.h1(slots.heading.attrs(), ['404 - Page Not Found']),
        h.p(slots.message.attrs(), [`The path "${input.path}" was not found.`]),
        h.a(slots.link.attrs([h.Href(input.backLinkHref)]), [input.backLinkText]),
      ]),
    )
    .pipe(Style.attach(NotFoundStyle))
