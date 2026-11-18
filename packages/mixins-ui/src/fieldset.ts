import { view as fieldsetView, type FieldsetAttributes } from '@foldkit/ui/fieldset'
import { Attr, Capability, Slot, Slots, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

export const FieldsetSlots = Slots.define({
  fieldset: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Disabled],
  }),
  legend: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
})

/** The fieldset's bundles with the attached Mixins applied. */
export type ResolvedFieldset<Message> = Resolved<
  FieldsetAttributes<Message>,
  typeof FieldsetSlots,
  Message
>

/** Applies `mixins` to the fieldset's bundles. */
export const resolve = <Input, Message>(
  attributes: FieldsetAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedFieldset<Message> => resolveFor(FieldsetSlots, mixins, context)(attributes)

/** The fieldset's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedFieldset<Message>) => Html,
  ) =>
  (attributes: FieldsetAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))

/**
 * A fieldset in one call: the legend that names the group, an optional
 * description under it, and the `content` the application drew. `disabled`
 * disables every control inside, as the native fieldset does. `toView` stays
 * for one drawn as something else.
 */
export interface FieldsetView<Message> {
  readonly id: string
  readonly legend: string
  readonly description?: string | undefined
  readonly content: ReadonlyArray<Html>
  readonly disabled?: boolean | undefined
  /** A style of `FieldsetSlots`, for the fieldset's look. */
  readonly style?: NamedStyle<typeof FieldsetSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message>(options: FieldsetView<Message>, h: HtmlBuilder<Message>): Html =>
  fieldsetView(
    {
      id: options.id,
      ...(options.disabled === undefined ? {} : { isDisabled: options.disabled }),
      hasDescription: options.description !== undefined,
      toView: toView(
        [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
        { input: undefined, h },
        ({ fieldset, legend, description }) =>
          h.fieldset(fieldset, [
            h.legend(legend, [options.legend]),
            ...(options.description === undefined ? [] : [h.p(description, [options.description])]),
            ...options.content,
          ]),
      ),
    },
    h,
  )
