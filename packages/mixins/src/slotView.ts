/**
 * `SlotView` is the structural equivalent of a Surface: a pure Foldkit view
 * that publishes typed Slots and lets Mixins attach without forking it. It
 * owns no state and runs no Effects. Attached Mixins are resolved into
 * ordinary Foldkit attributes per slot, using the view's own `h` so Message
 * capability masking is preserved.
 */
import { inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import type { SlotContribution } from './contribution.js'
import { evaluate, type AnyMixin, type Mixin, type MixinFor, type StaticMixin } from './mixin.js'
import { pipeSelf, type Pipeable } from './pipe.js'
import { resolve, type SlotAttributes } from './resolver.js'
import type { Any as AnySlot, SlotProtection } from './slot.js'

export type SlotBuilder<Message> = {
  readonly attrs: (base?: SlotAttributes<Message>) => SlotAttributes<Message>
}

export type SlotBuilders<Slots, Message> = {
  readonly [K in keyof Slots]: SlotBuilder<Message>
}

export type SlotViewRender<Slots, Input, Message> = (
  input: Input,
  slots: SlotBuilders<Slots, Message>,
  h: HtmlBuilder<Message>,
) => Html

export interface SlotView<Slots, Input, Message> extends Pipeable<SlotView<Slots, Input, Message>> {
  (input: Input, h: HtmlBuilder<Message>): Html
  readonly name?: string
  readonly slots: Slots
  readonly mixins: ReadonlyArray<MixinFor<Message>>
  readonly render: SlotViewRender<Slots, Input, Message>
}

/** Build one `attrs` resolver per published slot, evaluating Mixins lazily. */
export const buildersFor = <Slots, Message, Input>(
  slots: Slots,
  mixins: ReadonlyArray<MixinFor<Message>>,
  context: { readonly input: Input; readonly h: HtmlBuilder<Message> },
): SlotBuilders<Slots, Message> => {
  const source = slots as unknown as Record<string, AnySlot>
  const builders: Record<string, SlotBuilder<Message>> = Object.create(null)
  for (const name of Object.getOwnPropertyNames(source)) {
    const slot = source[name]
    if (slot === undefined) continue
    const protection: SlotProtection = slot.protected
    builders[name] = {
      attrs: (base?: SlotAttributes<Message>) => {
        const contributions = []
        for (const mixin of mixins) {
          const contribution = mixin.contributions[name]
          if (contribution !== undefined) {
            contributions.push(
              evaluate(contribution as SlotContribution<Message>, {
                input: context.input,
                h: context.h,
              }),
            )
          }
        }
        return resolve(base, contributions, { slot: name, protected: protection })
      },
    }
  }
  return builders as SlotBuilders<Slots, Message>
}

const makeView = <Slots, Input, Message>(
  name: string | undefined,
  slots: Slots,
  mixins: ReadonlyArray<MixinFor<Message>>,
  render: SlotViewRender<Slots, Input, Message>,
): SlotView<Slots, Input, Message> => {
  const view = (input: Input, h: HtmlBuilder<Message>): Html =>
    render(input, buildersFor(slots, mixins, { input, h }), h)
  // A function's own `name` is read-only; define it rather than assigning.
  if (name !== undefined) {
    Object.defineProperty(view, 'name', { value: name, configurable: true })
  }
  return Object.assign(view, {
    slots,
    mixins,
    render,
    pipe: (...fns: ReadonlyArray<(self: unknown) => unknown>) => pipeSelf(view, fns),
  }) as unknown as SlotView<Slots, Input, Message>
}

/**
 * Defines a view over published Slots.
 *
 * `Message` has no anchor but the render callback's builder, so it is inferred
 * from an explicit `h: HtmlBuilder<Message>` annotation on that parameter.
 * Without one it resolves to `unknown`, and the first error appears later and
 * elsewhere — an invariance mismatch at `Style.attach`/`Behavior.attach` that
 * does not name the missing annotation. `forMessages<Message>()` fixes the
 * Message universe up front instead, and leaves `h` contextually typed.
 */
export const define = <Slots, Input, Message>(
  slots: Slots,
  render: SlotViewRender<Slots, Input, Message>,
  options?: { readonly name?: string },
): SlotView<Slots, Input, Message> => makeView(options?.name, slots, [], render)

/**
 * Foldkit's `inertHtml` typed for a Message universe, for rendering a view
 * outside a runtime (tests, demos, static description). `inertHtml` is
 * `HtmlBuilder<never>`, and the builder is invariant in `Message`, so this is
 * the one cast: sound because inert handlers are never dispatched.
 */
export const inertBuilder = <Message>(): HtmlBuilder<Message> =>
  inertHtml as unknown as HtmlBuilder<Message>

/** The `SlotView` constructors with `Message` already fixed. */
export interface MessageSlotView<Message> {
  readonly define: <Slots, Input>(
    slots: Slots,
    render: SlotViewRender<Slots, Input, Message>,
    options?: { readonly name?: string },
  ) => SlotView<Slots, Input, Message>
}

/**
 * Binds the view constructors to one Message universe, so the render callback
 * no longer has to annotate `h` to pin it. `Input` is still inferred from the
 * callback's own `input` annotation.
 *
 * @example
 * ```ts
 * const Field = SlotView.forMessages<Message>().define(
 *   FieldSlots,
 *   (input: FieldInput, slots, h) =>
 *     h.input(slots.input.attrs([h.OnInput(value => Message.ChangedValue({ value }))])),
 * )
 * ```
 */
export const forMessages = <Message>(): MessageSlotView<Message> => ({ define })

/** A transform on any view, used by Message-free static mixins such as Style. */
export type SlotViewTransform = <Slots, Input, Message>(
  view: SlotView<Slots, Input, Message>,
) => SlotView<Slots, Input, Message>

/** A transform restricted to one Message universe, for Behavior mixins. */
export type SlotViewTransformFor<Message> = <Slots, Input>(
  view: SlotView<Slots, Input, Message>,
) => SlotView<Slots, Input, Message>

/** Attach one Mixin. Returns a new view; the original is unchanged. */
export function attach(mixin: StaticMixin<never> | Mixin<never>): SlotViewTransform
export function attach<MixinMessage>(mixin: Mixin<MixinMessage>): SlotViewTransformFor<MixinMessage>
export function attach(mixin: AnyMixin | Mixin<never>): any {
  return (view: SlotView<any, any, any>) =>
    makeView(view.name, view.slots, [...view.mixins, mixin], view.render)
}
