/**
 * The recipes' renderers under `foldkit-mixins-ui`'s Input Slot, for a form
 * drawn through `foldkit-mixins-form/ui`: the same native inputs as `./html`,
 * so the same names, states and Messages, with the Input recipe's look.
 */
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import type { RenderContext, Renderers } from 'foldkit-mixins-form'
import { InputSlots } from 'foldkit-mixins-ui'
import { renderers as plain } from './html.js'

/** A renderer for each recipe kind, its input styled by `styles.input`. */
export const renderers = <Message>(
  styles: { readonly input?: NamedStyle<typeof InputSlots> | undefined } = {},
): Renderers<Message> => {
  // Generic in the Slots, as `foldkit-mixins-form/ui`'s is, so the Input's builder
  // stands in for the field's `text` one: it holds while a renderer only calls
  // `attrs` on it, as every one here does.
  const builders = <S>(
    slots: S,
    style: NamedStyle<S> | undefined,
    context: RenderContext<Message>,
  ) =>
    SlotView.buildersFor(slots, style === undefined ? [] : [style.mixin], {
      input: context.input.field,
      h: context.h,
    })
  return Object.fromEntries(
    Object.entries(plain<Message>()).map(([kind, render]) => [
      kind,
      context =>
        render({
          ...context,
          slots: {
            ...context.slots,
            text: builders(InputSlots, styles.input, context).input,
          },
        }),
    ]),
  )
}
