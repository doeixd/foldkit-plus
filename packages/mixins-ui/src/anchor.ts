/**
 * `@foldkit/ui`'s anchor positioning as a Mount and a Behavior, and the top
 * layer around an anchored panel: the floating element is placed against the
 * button whose id is given, with placement, gap, offset, padding, portal and
 * flip handled by `anchorSetup`, which also releases on unmount. The Mount
 * writes `top` and `left` on the element itself, imperatively (and `position`
 * too under the `fixed` strategy); a Style on the same slot must leave those
 * alone, and `data-placement` is written by `@foldkit/ui` for styling.
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
 *
 * Where the anchor Mount is `@foldkit/ui`'s own (Popover, Tooltip), the panel
 * cannot take a second Mount, so `layer` is an element around it that shows
 * in the top layer itself; and `PlaceArrow` points an arrow for an anchor
 * that computes none.
 */
import { Effect, Schema, Stream } from 'effect'
import { AnchorConfig, anchorSetup } from '@foldkit/ui/anchor'
import type { Attribute, HtmlBuilder } from 'foldkit/html'
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

/**
 * Whether the element can show as a popover: the API exists and the element
 * has the attribute, without which `showPopover` throws `NotSupportedError`.
 */
const isPopover = (
  element: Element,
): element is HTMLElement & { showPopover(): void; hidePopover(): void } =>
  element instanceof HTMLElement &&
  typeof element.showPopover === 'function' &&
  element.hasAttribute('popover')

/**
 * Shows the element as a manual popover for as long as the scope is open.
 * Where the popover API or the attribute is missing (a test renderer, SSR, a
 * panel drawn without it) it does nothing.
 */
const heldInTopLayer = (element: Element) =>
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
  )

/**
 * Draw an upstream-anchored, in-place panel in the browser's top layer: show
 * it as a manual popover, run the wrapped Mount's own acquire (which
 * positions it), and hide it once that Mount releases. Use it only when the
 * anchor keeps the panel in place (`portal: false`): upstream portal
 * relocation moves the element after the Mount acquires, and moving a shown
 * popover hides it again. The panel carries `popover="manual"` in its view.
 * Where the popover API or the attribute is missing the wrapper is a no-op
 * and the anchor positions in place.
 *
 * The view sets `inset: auto` on the panel, since the anchor writes only
 * `left` and `top` over the browser's `inset: 0`. The browser's popover
 * border, padding and `Canvas` fill stay on an unstyled panel: any author
 * rule replaces them, as every recipe's panel does, where an inline reset
 * would beat the recipes.
 */
export const topLayer = <Message, E>(
  action: Mount.MountAction<Message, E>,
): Mount.MountAction<Message, E> => ({
  ...action,
  f: (element, viewStateChanges) =>
    Stream.unwrap(heldInTopLayer(element).pipe(Effect.as(action.f(element, viewStateChanges)))),
})

/** Shows its element in the top layer while it is drawn: the `layer` bundle's Mount. */
export const TopLayer = Mount.defineStream('TopLayer', {
  messages: [Schema.Never],
  execute: ({ element }) => Stream.unwrap(heldInTopLayer(element).pipe(Effect.as(Stream.never))),
})

/**
 * A box in the top layer, the viewport's width and no height, for a panel
 * whose anchor Mount is `@foldkit/ui`'s: an element holds one Mount, so the
 * panel cannot also carry the one that shows it. Drawn around the panel, the
 * layer takes the panel out of every stacking context and ancestor
 * `overflow`, and the anchor places the panel inside it as on the page: the
 * layer is fixed at the viewport's corner, so its coordinates are the
 * viewport's, and as wide, so the panel's widths and `100%` read as they
 * would. With no height it covers nothing a press could land on. Its look
 * is inline: the browser's popover border, padding and fill must not show
 * around a panel, whatever a theme does.
 */
export const layer = <Message>(h: HtmlBuilder<Message>): ReadonlyArray<Attribute<Message>> => [
  ...layerBox(h),
  h.OnMount(TopLayer()),
]

/**
 * The `layer` box without its Mount, for a box whose own Mount shows it
 * (`topLayer` around one that sends Messages, which a Scene can resolve
 * where `TopLayer` sends none). `style` joins the box's inline style, since
 * a second `h.Style` on the element would replace it.
 */
export const layerBox = <Message>(
  h: HtmlBuilder<Message>,
  style: Readonly<Record<string, string>> = {},
): ReadonlyArray<Attribute<Message>> => [
  h.Attribute('popover', 'manual'),
  h.Style({
    position: 'fixed',
    inset: '0 0 auto 0',
    inlineSize: 'auto',
    maxInlineSize: 'none',
    margin: '0',
    padding: '0',
    border: '0',
    background: 'transparent',
    color: 'inherit',
    overflow: 'visible',
    ...style,
  }),
]

/**
 * Places an arrow drawn as a panel's child against the middle of the
 * element whose id is given, for a panel whose anchor computes no arrow
 * (`@foldkit/ui`'s Tooltip). It writes `--arrow-x` (above or below) or
 * `--arrow-y` (beside) on the arrow, the properties upstream's anchor writes
 * on a panel, and the other `initial`, so one rule styles both. It follows
 * the panel: the anchor writes the panel's `style` and `data-placement` on
 * every move, its first showing included, and each write places the arrow.
 */
export const PlaceArrow = Mount.defineStream('PlaceArrow', {
  messages: [Schema.Never],
  args: { buttonId: Schema.String },
  execute: ({ element, buttonId }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const panel = element.parentElement
          const root = element.getRootNode()
          const button =
            root instanceof Document || root instanceof ShadowRoot
              ? root.getElementById(buttonId)
              : null
          if (!(element instanceof HTMLElement) || panel === null || button === null) {
            return () => {}
          }
          const place = () => {
            const side = panel.getAttribute('data-placement')
            const target = button.getBoundingClientRect()
            const box = panel.getBoundingClientRect()
            const beside = side === 'left' || side === 'right'
            const at = beside
              ? target.top +
                target.height / 2 -
                box.top -
                panel.clientTop -
                element.offsetHeight / 2
              : target.left +
                target.width / 2 -
                box.left -
                panel.clientLeft -
                element.offsetWidth / 2
            element.style.setProperty(beside ? '--arrow-y' : '--arrow-x', `${at}px`)
            element.style.setProperty(beside ? '--arrow-x' : '--arrow-y', 'initial')
          }
          const observer = new MutationObserver(place)
          observer.observe(panel, {
            attributes: true,
            attributeFilter: ['style', 'data-placement'],
          })
          return () => observer.disconnect()
        }),
        release => Effect.sync(release),
      ),
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
