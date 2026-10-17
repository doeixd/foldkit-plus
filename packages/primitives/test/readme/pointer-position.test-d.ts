// The README's `PointerPosition` example (dom/README.md), compiled.
import { Match, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { PointerPosition } from '../../src/dom/index.js'

const Message = defineMessageUnion({
  /** The pointer is `share` of the way across the track, 0 to 1, left to right. */
  Pointed: { share: Schema.Number },
  Released: {},
})

const shareOf = (x: number, width: number) =>
  width === 0 ? 0 : Math.min(1, Math.max(0, x / width))

const track = (h: HtmlBuilder<typeof Message.Type>): Html =>
  h.div(
    [
      h.OnMount(
        Mount.mapMessage(PointerPosition({ focus: '[role="slider"]' }), fact =>
          Match.valueTags(fact, {
            PointerPressed: ({ point, width }) =>
              Message.Pointed({ share: shareOf(point.x, width) }),
            PointerMoved: ({ point, width }) => Message.Pointed({ share: shareOf(point.x, width) }),
            PointerReleased: () => Message.Released(),
          }),
        ),
      ),
    ],
    [h.div([h.Role('slider'), h.Tabindex(0)], [])],
  )

void track
