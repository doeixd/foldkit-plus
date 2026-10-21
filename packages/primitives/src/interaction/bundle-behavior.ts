/**
 * The mixin half of a Bundle: a Behavior whose slots are wired to the
 * Bundle's Messages through its `Declared` placement.
 *
 * The Bundle owns the Model, its Message union and the transition; a parent
 * declares and places it (`Bundle.declare(...).at(...)`); this Behavior writes
 * the element's attributes from the placed slice and mounts the Bundle's
 * events, wrapping each Message with the placement's `wrapper` into the
 * parent's universe. A Behavior still owns no state, and a Message still has
 * one update: this is a bridge, not a second runtime.
 *
 * `attributes` receives `send`, the same wrap, for a handler it writes itself
 * (`h.OnClick(send(Message.Activated({ id })))`). `events` receives the
 * Bundle's own Mount (a `Mount.defineStream`), and the helper supplies the
 * mapping, so a caller never repeats `Mount.mapMessage(events, wrapper.make)`.
 */
import type { HtmlBuilder } from 'foldkit/html'
import type { MountAction } from 'foldkit/mount'
import * as Mount from 'foldkit/mount'
import type { Bundle, Declared } from 'foldkit-bundle'
import {
  Behavior,
  type BehaviorSlotOptions,
  type NamedBehavior,
  type SlotAttributes,
  type SlotItem,
  type SlotRequirements,
} from 'foldkit-mixins'

// `any` for the bundle and the field so a behavior's own generic `Field`
// (`Declared<typeof bundle, Field>`) is accepted; the parts stay inferred.
type BundleOf<D extends Declared<any, any>> = D extends Declared<infer B, any> ? B : never

/** The Bundle's Model, which the parent's `Input` must hold at `declared.field`. */
export type BundleModelOf<D extends Declared<any, any>> = Bundle.BundleParts<BundleOf<D>>['Model']

/** The Bundle's Message, which `send` wraps for the parent. */
export type BundleMessageOf<D extends Declared<any, any>> = Bundle.BundleParts<
  BundleOf<D>
>['Message']

export interface BundleSlotOptions<D extends Declared<any, any>, Input, ParentMessage> {
  readonly requires?: SlotRequirements
  readonly attributes?: (context: {
    readonly input: Input
    readonly h: HtmlBuilder<ParentMessage>
    readonly item?: SlotItem
    /** The Bundle's Message as the parent's: what a handler the Behavior writes takes. */
    readonly send: (message: BundleMessageOf<D>) => ParentMessage
  }) => SlotAttributes<ParentMessage>
  /** The Bundle's events, mounted on this slot and wrapped for the parent. */
  readonly events?: MountAction<BundleMessageOf<D>, any>
}

export type BundleBehaviorSpec<D extends Declared<any, any>, Input, ParentMessage> = Readonly<
  Record<string, BundleSlotOptions<D, Input, ParentMessage>>
>

/**
 * `fromBundle(declared)(slots)<Input, ParentMessage>(spec)` — a Behavior over
 * `declared`, with every `events` mount and every `send` mapped through the
 * placement's wrapper. `Input` must hold the Bundle's Model at the declared
 * field, so attributes read the placed slice; the parent's `Message` includes
 * the declared wrapper cases, so nothing can be sent outside it.
 */
export const fromBundle =
  <D extends Declared<any, any>>(declared: D) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in D['field']]: BundleModelOf<D> }, ParentMessage>(
    spec: BundleBehaviorSpec<D, Input, ParentMessage>,
    options?: { readonly name?: string },
  ): NamedBehavior<Slots, Input, ParentMessage> => {
    const send = (message: BundleMessageOf<D>): ParentMessage =>
      declared.wrapper.make(message) as unknown as ParentMessage
    const built: Record<string, BehaviorSlotOptions<Input, ParentMessage>> = Object.create(null)
    for (const [name, slot] of Object.entries(
      spec as Record<string, BundleSlotOptions<D, Input, ParentMessage> | undefined>,
    )) {
      if (slot === undefined) continue
      const { requires, attributes, events } = slot
      if (requires === undefined && attributes === undefined && events === undefined) continue
      built[name] = {
        ...(requires === undefined ? {} : { requires }),
        ...(attributes === undefined
          ? {}
          : {
              attributes: context =>
                attributes({
                  input: context.input as Input,
                  h: context.h,
                  ...(context.item === undefined ? {} : { item: context.item }),
                  send,
                }),
            }),
        ...(events === undefined ? {} : { mount: () => Mount.mapMessage(events, send) }),
      }
    }
    return Behavior.forSlots(slots)<Input, ParentMessage>(
      // Built slot by slot from the same contract `forSlots` validates.
      built as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      options,
    )
  }

export const BundleBehavior = { fromBundle } as const
