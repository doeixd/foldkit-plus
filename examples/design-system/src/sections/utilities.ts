/**
 * The Utilities section as an island: an input group, icons with touch targets, a scroll area and the pattern catalog.
 */
import { Schema } from 'effect'
import { Runtime } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { SlotView } from 'foldkit-mixins'
import { Patterns, ScrollArea } from 'foldkit-mixins-ui'
import { IconStyle, InputGroupStyle, PageStyle, ScrollAreaStyle } from '../style.js'
import { IconSlots, InputGroupSlots, PageSlots } from '../slots.js'
import { neverH } from '../shared.js'

export const Model = Schema.Struct({ address: Schema.String })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ AddressTyped: { value: Schema.String } })
export type Message = typeof Message.Type

export const initModel = (): Model => ({ address: 'about' })

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    AddressTyped: ({ value }) => ({ model: modifyFields(model, { address: () => value }) }),
  })

const InputGroupDemo = SlotView.forMessages<Message>()
  .define(InputGroupSlots, (value: string, slots, h) =>
    h.div(
      [],
      [
        h.div(slots.group.attrs(), [
          h.span(slots.affix.attrs(), ['/']),
          h.input(
            slots.control.attrs([
              h.Type('text'),
              h.Value(value),
              h.AriaLabel('Site path'),
              h.OnInput((typed: string) => Message.AddressTyped({ value: typed })),
            ]),
          ),
        ]),
      ],
    ),
  )
  .pipe(SlotView.attach(InputGroupStyle.style.mixin))

const IconsDemo = SlotView.forMessages<Message>()
  .define(IconSlots, (_input: unknown, slots, h) =>
    h.div(slots.row.attrs(), [
      h.span(slots.chip.attrs([h.DataAttribute('icon', 'dot')]), ['Status']),
      h.span(slots.chip.attrs([h.DataAttribute('icon', 'star')]), ['Featured']),
    ]),
  )
  .pipe(SlotView.attach(IconStyle.style.mixin))

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  return h.div(slots.body.attrs(), [
    h.p(slots.sectionText.attrs(), [
      'Mechanisms, not components: an InputGroup address field, attribute-dispatched icons with coarse-pointer touch targets, and the accessibility pattern catalog every adapter is gated against.',
    ]),
    InputGroupDemo(model.address, h),
    h.p(slots.sectionText.attrs(), [`Previewing “/${model.address}”.`]),
    h.p(slots.sectionText.attrs(), [
      'A scroll area chains at its edge: the box scrolls instead of the page.',
    ]),
    ScrollArea.view(
      {
        content: h.div(
          [],
          [
            'The first line stays put while the rest moves.',
            'Chained scrolling stops here instead of taking the page with it.',
            'The bars stay thin in both schemes.',
            'Keyboard users reach it by Tab: the viewport is a stop.',
            'Twelve rems of box; the rest is overflow.',
            'Short lines, many of them: the box never grows.',
            'Each line is ordinary section text in a plain div.',
            'Nothing here dispatches; the demo scrolls, nothing more.',
            'Nine lines at this measure clear twelve rems.',
          ].map(line => h.p(slots.sectionText.attrs(), [line])),
        ),
        style: ScrollAreaStyle,
      },
      neverH,
    ),
    IconsDemo(undefined, h),
    h.div(slots.code.attrs(), [
      Patterns.catalog
        .map(
          entry =>
            `${entry.name} (${entry.tier}): roles [${entry.roles.join(', ')}] floor [${entry.floor.join(', ') || 'none'}]`,
        )
        .join('\n'),
    ]),
  ])
}

export const mount = (container: HTMLElement): void => {
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initModel() }),
      update,
      view,
    }),
  )
}
