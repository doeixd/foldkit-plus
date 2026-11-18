/**
 * The examples' own layout Slots: a row and a stack for an example that
 * draws several things, declared over the theme module as an application
 * declares its own.
 */
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { SlotView } from 'foldkit-mixins'
import { slots, t } from './theme.js'

const Layout = slots({
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: t.space.sm },
  stack: { display: 'flex', flexDirection: 'column', alignItems: 'start', gap: t.space.md },
  note: { margin: '0', color: t.text.muted, fontSize: t.size.sm },
  label: { color: t.text.muted },
})

const place =
  (slot: keyof typeof Layout.slots, tag: 'div' | 'p' | 'span') =>
  <Message>(
    h: HtmlBuilder<Message>,
    children: ReadonlyArray<Html | string>,
    attributes: ReadonlyArray<Attribute<Message>> = [],
  ): Html =>
    h[tag](
      SlotView.buildersFor(Layout.slots, [Layout.style.mixin], { input: undefined, h })[slot].attrs(
        attributes,
      ),
      children,
    )

/** Children side by side, wrapping. */
export const row = place('row', 'div')
/** Children one under another. */
export const stack = place('stack', 'div')
/** A quiet line of text under an example, saying what its state holds. */
export const note = place('note', 'p')
/** A few quiet words inside another widget's slot: a group's heading, a caption. */
export const label = place('label', 'span')
