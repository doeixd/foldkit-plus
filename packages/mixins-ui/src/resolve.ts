/**
 * Binds a `@foldkit/ui` component's published Slots and the Mixins attached to
 * it. The returned function takes the component's own attribute bundles (from
 * its `toView` callback) and returns them with Mixin contributions resolved by
 * the core resolver. Base attributes and `ChildAttribute`s are preserved
 * untouched; non-slot entries (`animatePanel`) pass through unchanged.
 */
import type { HtmlBuilder } from 'foldkit/html'
import {
  SlotView,
  type MixinValue,
  type SlotAttributes,
  type SlotBuilders,
  type StaticMixin,
} from 'foldkit-mixins'

export type MixinList<Message> = ReadonlyArray<
  MixinValue<Message> | MixinValue<never> | StaticMixin<Message>
>

export interface ResolveContext<Input, Message> {
  /** What an input-driven Mixin reads; omit it when no attached Mixin reads one. */
  readonly input?: Input
  readonly h: HtmlBuilder<Message>
}

export type ResolvedSlots<Slots, Message> = {
  readonly [K in keyof Slots]: SlotAttributes<Message>
}

/** A component's `Base` bundles with every slot among them resolved. */
export type Resolved<Base, Slots, Message> = Omit<Base, keyof Slots> & ResolvedSlots<Slots, Message>

/** `SlotView.buildersFor` over a context whose `input` may be left out. */
export const buildersOf = <Slots, Input, Message>(
  slots: Slots,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): SlotBuilders<Slots, Message> =>
  SlotView.buildersFor(slots, mixins, { input: context.input, h: context.h })

export const resolveFor =
  <Slots, Input, Message>(
    slots: Slots,
    mixins: MixinList<Message>,
    context: ResolveContext<Input, Message>,
  ) =>
  <Base extends { readonly [K in keyof Slots]?: SlotAttributes<Message> }>(
    base: Base,
  ): Resolved<Base, Slots, Message> => {
    const builders = buildersOf(slots, mixins, context)
    const out: Record<string, unknown> = Object.assign(Object.create(null), base)
    for (const name of Object.getOwnPropertyNames(slots as object)) {
      out[name] = builders[name as keyof Slots].attrs(base[name as keyof Slots])
    }
    return out as Resolved<Base, Slots, Message>
  }
