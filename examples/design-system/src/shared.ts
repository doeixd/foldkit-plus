/** Views with no Messages, which the eager page and the islands both draw. */
import { SlotView } from 'foldkit-mixins'
import { StatusStyle } from './style.js'
import { BadgeSlots } from './slots.js'

/** A message-free builder for the stateless views: alert, avatar, breadcrumb,
 * empty, item, kbd, separator, skeleton, spinner, and table take no messages,
 * so their views never ask the builder to dispatch. Built once, shared by
 * every static draw below — like the inert builder the package tests use.
 * Their VNodes carry no handlers and mount as static content in the live page.
 */
export const neverH = SlotView.inertBuilder<never>()

export const BadgesView = SlotView.forMessages<never>()
  .define(BadgeSlots, (_input: unknown, slots, h) =>
    h.div(slots.row.attrs(), [
      ...(
        [
          ['plain', 'Draft'],
          ['ok', 'Live'],
          ['warn', 'Expiring'],
          ['info', 'New'],
          ['bad', 'Failed'],
        ] as const
      ).map(([state, label]) =>
        h.span(slots.badge.attrs([h.DataAttribute('state', state)]), [label]),
      ),
    ]),
  )
  .pipe(SlotView.attach(StatusStyle.style.mixin))
