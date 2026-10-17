// The README's `TrackBox` example (dom/README.md), compiled.
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { Schema } from 'effect'
import { TRACK_TARGET_ATTRIBUTE, TrackBox } from '../../src/dom/index.js'

const Message = defineMessageUnion({
  /** The element marked is `found` on the page, or not. */
  Marked: { found: Schema.Boolean },
})

// A ring 4px outside the element whose id is `target`, wherever it scrolls.
const ring = (target: string, h: HtmlBuilder<typeof Message.Type>): Html =>
  h.div(
    [
      h.Attribute(TRACK_TARGET_ATTRIBUTE, target),
      h.OnMount(
        Mount.mapMessage(TrackBox({ name: 'mark', radius: true }), ({ found }) =>
          Message.Marked({ found }),
        ),
      ),
    ],
    [
      h.div(
        [
          h.Style({
            position: 'fixed',
            left: 'calc(var(--fk-mark-x) - 4px)',
            top: 'calc(var(--fk-mark-y) - 4px)',
            width: 'calc(var(--fk-mark-w) + 8px)',
            height: 'calc(var(--fk-mark-h) + 8px)',
            borderRadius: 'calc(var(--fk-mark-radius) + 4px)',
            outline: '2px solid',
            pointerEvents: 'none',
          }),
        ],
        [],
      ),
    ],
  )

void ring
