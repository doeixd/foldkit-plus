/**
 * `@foldkit/ui`'s anchor positioning as a Mount and a Behavior, and the top
 * layer around an anchored panel: the floating element is placed against the
 * button whose id is given, with placement, gap, offset, padding, portal and
 * flip handled by `anchorSetup`, which also releases on unmount. The Mount
 * writes `position`, `top` and `left` on the element itself, imperatively; a
 * Style on the same slot must leave those alone, and `data-placement` is
 * written by `@foldkit/ui` for styling.
 *
 * `portal` defaults to true upstream: the element is relocated into a
 * portal root, so the runtime no longer patches it and a test sees it move.
 * Pass `portal: false` to keep the node where the view drew it. Positioning
 * without layout (jsdom's zero geometry) burns tens of seconds, portal or
 * not — drive the config, not the clock, in tests.
 *
 * `topLayer` draws an upstream-anchored, in-place panel in the browser's top
 * layer instead: it shows the element as a manual popover around the wrapped
 * Mount's own acquire, and hides it when that Mount releases. Use it only
 * when the anchor keeps the panel in place (`portal: false`); moving a
 * relocated panel hides its popover again. The node stays where the runtime
 * drew it (no portal relocation), so no stacking context or ancestor
 * overflow can reach it, while the anchor positions it as before.
 * The panel carries `popover="manual"` in its view; light dismiss stays the
 * application's Messages. Wrapping keeps the wrapped Mount's name, args and
 * Messages, so `Scene.Mount.resolve` still matches it.
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

/**
 * The elements showing as manual popovers, so release hides only what this
 * Mount showed: `showPopover` throws when the popover already shows, and no
 * popover API reports it (`:top-layer` is not selectable everywhere).
 */
const shown = new WeakSet<Element>()

const isPopover = (
  element: Element,
): element is HTMLElement & { showPopover(): void; hidePopover(): void } =>
  element instanceof HTMLElement && typeof element.showPopover === 'function'

/**
 * Draw an upstream-anchored, in-place panel in the browser's top layer: show
 * it as a manual popover, run the wrapped Mount's own acquire (which
 * positions it), and hide it once that Mount releases. Use it only when the
 * anchor keeps the panel in place (`portal: false`): upstream portal
 * relocation moves the element after the Mount acquires, and moving a shown
 * popover hides it again. The panel carries `popover="manual"` in its view.
 * Where the popover API is missing (a test renderer, SSR) the wrapper is a
 * no-op and the anchor positions in place.
 */
export const topLayer = <Message, E>(
  action: Mount.MountAction<Message, E>,
): Mount.MountAction<Message, E> => ({
  ...action,
  f: (element, viewStateChanges) =>
    Stream.unwrap(
      Effect.acquireRelease(
        Effect.sync(() => {
          if (isPopover(element) && !shown.has(element)) {
            element.showPopover()
            shown.add(element)
          }
        }),
        () =>
          Effect.sync(() => {
            if (shown.has(element) && isPopover(element)) {
              shown.delete(element)
              element.hidePopover()
            }
          }),
      ).pipe(Effect.as(action.f(element, viewStateChanges))),
    ),
})

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
