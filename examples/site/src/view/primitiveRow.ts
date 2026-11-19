/**
 * A primitive as a row of its family's list on the Primitives gallery. Over
 * any Message, so the row can be drawn alone (its browser test does).
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { SlotBuilders } from 'foldkit-mixins'

import { guideOf, type Card, type Family } from '../gallery/primitives.js'
import type { SiteStyle } from '../style.js'

/** A sentence with `code` in backticks drawn as code. */
export const withCode = <M>(h: HtmlBuilder<M>, text: string): ReadonlyArray<Html | string> =>
  text.split('`').map((part, at) => (at % 2 === 1 ? h.code([], [part]) : part))

/** A primitive as a row of its family's list: name, what it is for, the form it takes. */
export const row = <M>(
  family: Family,
  entry: Card,
  slots: SlotBuilders<typeof SiteStyle.slots, M>,
  h: HtmlBuilder<M>,
): Html =>
  h.li(
    [],
    [
      h.a(slots.primitive.attrs([h.Href(guideOf(family.id))]), [
        h.span(slots.primitiveName.attrs(), [entry.name]),
        h.span(slots.primitiveAbout.attrs(), withCode(h, entry.about)),
        h.span(slots.primitiveForm.attrs(), [entry.form]),
      ]),
    ],
  )
