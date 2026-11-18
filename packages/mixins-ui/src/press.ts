import type { SlotAttributes } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'

/** What pressing a surface does: send a Message, or follow a link. */
export type Press<Message> =
  | { readonly onClick: Message }
  | {
      readonly href: string
      /** Open in a new tab, and say so to a screen reader. */
      readonly external?: boolean | undefined
    }

// The name `FLUID_PRESS_ATTRIBUTE` holds in `foldkit-primitives/dom`, written out: importing the
// constant keeps that module's FluidHover in every page that draws a pressable surface. A test
// holds the two equal.
export const PRESS_MARK = 'data-fluid-press'

const flag = (on: boolean | undefined) => (on === true ? 'true' : 'false')

/**
 * The one control stretched over a pressable surface (a card, an item),
 * named by `name`: a link that goes nowhere while disabled and says
 * (`newTab`) when it opens a new tab, or a button that is pressed while chosen.
 */
export const overlay = <Message>(
  h: HtmlBuilder<Message>,
  attrs: (attributes: ReadonlyArray<Attribute<Message>>) => SlotAttributes<Message>,
  press: Press<Message>,
  state: {
    readonly name: string
    readonly selected: boolean | undefined
    readonly disabled: boolean
    readonly newTab: string
  },
): Html => {
  const shared: ReadonlyArray<Attribute<Message>> = [
    h.AriaLabel(state.name),
    h.Attribute(PRESS_MARK, ''),
  ]
  if ('href' in press) {
    const external = press.external === true
    return h.a(
      attrs([
        ...shared,
        ...(state.disabled
          ? [h.AriaDisabled(true)]
          : [
              h.Href(press.href),
              ...(external ? [h.Target('_blank'), h.Rel('noopener noreferrer')] : []),
            ]),
        ...(state.selected === true ? [h.AriaCurrent('page')] : []),
        ...(external ? [h.AriaDescription(state.newTab)] : []),
      ]),
      [],
    )
  }
  return h.button(
    attrs([
      ...shared,
      h.Type('button'),
      ...(state.selected === undefined ? [] : [h.AriaPressed(flag(state.selected))]),
      // `aria-disabled`, not `disabled`: a button that disables itself under the keys drops the focus.
      ...(state.disabled ? [h.AriaDisabled(true)] : [h.OnClick(press.onClick)]),
    ]),
    [],
  )
}
