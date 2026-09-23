/**
 * `@foldkit/ui`'s anchor positioning as a Mount and a Behavior: the floating
 * element is placed against the button whose id is given, with placement,
 * gap, offset, padding, portal and flip handled by `anchorSetup`, which also
 * releases on unmount. The Mount writes `position`, `top` and `left` on the
 * element itself, imperatively; a Style on the same slot must leave those
 * alone, and `data-placement` is written by `@foldkit/ui` for styling.
 */
import { Effect, Schema, Stream } from 'effect'
import { AnchorConfig, anchorSetup } from '@foldkit/ui/anchor'
import * as Mount from 'foldkit/mount'
import { Behavior, Capability } from 'foldkit-mixins'

export const Anchor = Mount.defineStream('Anchor', {
  messages: [Schema.Never],
  args: {
    /** The id of the element the floating one is placed against. */
    buttonId: Schema.String,
    anchor: AnchorConfig,
    interceptTab: Schema.optional(Schema.Boolean),
    focusAfterPosition: Schema.optional(Schema.Boolean),
    focusSelector: Schema.optional(Schema.String),
    arrowId: Schema.optional(Schema.String),
    arrowPadding: Schema.optional(Schema.Number),
  },
  execute: ({ element, buttonId, anchor, ...optional }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() =>
          // `Schema.optional` admits undefined; the setup wants the key absent.
          anchorSetup(element, {
            buttonId,
            anchor,
            ...Object.fromEntries(
              Object.entries(optional).filter(
                ([key, value]) => key !== 'viewStateChanges' && value !== undefined,
              ),
            ),
          }),
        ),
        release => Effect.sync(() => release()),
      ),
    ),
})

export type AnchorArgs = Parameters<typeof Anchor>[0]

export interface BehaviorOptions<Input, Slots> {
  /** The slot to position. */
  readonly floating: keyof Slots & string
  readonly config: (input: Input) => AnchorArgs
}

/** Mounts the anchor on the floating slot with the config the input gives. */
export const behavior =
  <Slots>(slots: Slots) =>
  <Input, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.floating]: Behavior.slot({
          requires: { capability: Capability.Container },
          mount: (input: Input) => Anchor(options.config(input)),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'Anchor' },
    )
