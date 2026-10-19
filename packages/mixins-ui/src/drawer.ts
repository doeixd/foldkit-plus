/**
 * A Drawer: a panel docked to the bottom of the screen that peeks or opens,
 * beside the page rather than over it. Nothing is trapped, dimmed or locked:
 * the page under it stays live, so what its controls change shows at once,
 * as a map's or an editor's tool tray. A modal one is the `Sheet`.
 *
 * ```text
 * handle or grip: Swipe -> Grabbed / Dragged / Released -> update -> open or peek
 * handle: click or Enter -> Pressed -> update -> the other one
 * view: open -> data-open; a drag -> --fk-drawer-offset, --fk-drawer-progress
 * ```
 *
 * Let go, a flick (faster than the Sheet's `FLICK_SPEED`) goes its way; a
 * slower release goes once dragged `CLOSE_SHARE` of the panel, and rests
 * where it was otherwise. A press on the handle that barely moves is a
 * click, which toggles it; the click a browser sends after a drag is no
 * press, and is passed over. A drag starts on the handle, or on a `grip`
 * the application gives an element of its own (its tabs' row), where a
 * vertical swipe drags and a sideways one still scrolls.
 *
 * The recipe (`Recipes.Drawer`) docks it, below a width or always, and draws
 * the handle a bar that bends into a chevron as the drawer goes down, along
 * with the finger while one drags it. Undocked, it is the column it sits in,
 * and its open state waits for the next narrow screen.
 */
import { Match, Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import {
  Attr,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
  type SlotAttributes,
} from 'foldkit-mixins'
import { Swipe } from 'foldkit-primitives/dom'
import type { MixinList } from './resolve.js'
import { CLOSE_SHARE, FLICK_SPEED, PRESS_SLOP } from './sheet.js'

export const DrawerSlots = Slots.define({
  panel: Slot.make({ capability: Capability.Container }),
  handle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  body: Slot.make({ capability: Capability.Container }),
  /** More of the panel to drag it by, such as a row of tabs: vertical swipes drag, sideways ones scroll. */
  grip: Slot.make({ capability: Capability.Container }),
})

/** Where a drag began: the handle, whose click it ends with, or a grip, which has none. */
export const Origin = Schema.Literals(['handle', 'grip'])
export type Origin = typeof Origin.Type

export const Model = Schema.Struct({
  /** The body's id, unique in the document, which the handle controls. */
  id: Schema.String,
  open: Schema.Boolean,
  /** While a drag runs: the panel's height as it began, and how far down it has come, in pixels. */
  drag: Schema.Option(Schema.Struct({ size: Schema.Number, delta: Schema.Number, from: Origin })),
  /** Whether the last press on the handle dragged, so the click after it is no press. */
  dragged: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** The handle or a grip was pressed; `size` is the panel's height. */
  Grabbed: { size: Schema.Number, from: Origin },
  /** Down, from where the press began. */
  Dragged: { delta: Schema.Number },
  /** Let go: the last delta and its speed downward, or cancelled. */
  Released: { delta: Schema.Number, velocity: Schema.Number, completed: Schema.Boolean },
  /** The handle was clicked, or pressed from the keyboard. */
  Pressed: {},
})
export type Message = typeof Message.Type

export interface InitConfig {
  /** The body's id, unique in the document. */
  readonly id: string
  /** Whether it starts open. Default false: peeking, out of the page's way. */
  readonly open?: boolean
}

export const init = (config: InitConfig): Model => ({
  id: config.id,
  open: config.open ?? false,
  drag: Option.none(),
  dragged: false,
})

/** Opens the Drawer, as a control elsewhere that wants its contents seen does. */
export const open = (model: Model): Model =>
  model.open ? model : modifyFields(model, { open: () => true })

export const close = (model: Model): Model =>
  model.open ? modifyFields(model, { open: () => false }) : model

/** Whether a drag let go at `delta`, moving at `velocity`, leaves it open. */
export const settle = (release: {
  readonly open: boolean
  readonly size: number
  readonly delta: number
  readonly velocity: number
}): boolean => {
  const { open, size, delta, velocity } = release
  if (velocity > FLICK_SPEED) return false
  if (velocity < -FLICK_SPEED) return true
  return open ? delta < CLOSE_SHARE * size : -delta >= CLOSE_SHARE * size
}

/** The Drawer after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Model =>
  Message.match(message, {
    Grabbed: ({ size, from }) =>
      modifyFields(model, {
        drag: () => Option.some({ size, delta: 0, from }),
        dragged: () => false,
      }),
    Dragged: ({ delta }) =>
      Option.match(model.drag, {
        onNone: () => model,
        onSome: drag =>
          drag.delta === delta
            ? model
            : modifyFields(model, { drag: () => Option.some({ ...drag, delta }) }),
      }),
    Released: ({ delta, velocity, completed }) =>
      Option.match(model.drag, {
        onNone: () => model,
        onSome: ({ size, from }) => {
          // A press that barely moved is the click that follows it.
          if (!completed || Math.abs(delta) < PRESS_SLOP)
            return modifyFields(model, { drag: () => Option.none() })
          const open = settle({ open: model.open, size, delta, velocity })
          return modifyFields(model, {
            drag: () => Option.none(),
            open: () => open,
            // Only the handle has a click to pass over; a grip's drag ends with none.
            dragged: () => from === 'handle',
          })
        },
      }),
    Pressed: () =>
      model.dragged
        ? modifyFields(model, { dragged: () => false })
        : modifyFields(model, { open: open => !open }),
  })

/**
 * How far down it is, from 0 (open) to 1 (peeking), during a drag: what the
 * handle bends by. The drag is read against the panel's height, which is a
 * little more than it travels, so the chevron is not quite full at the peek.
 */
export const progress = (model: Model, drag: { readonly size: number; readonly delta: number }) =>
  Math.min(1, Math.max(0, (model.open ? 0 : 1) + drag.delta / Math.max(1, drag.size)))

/** The attributes the Drawer's view hands `draw`, each slot's own. */
export interface ResolvedDrawer<Message> {
  readonly panel: SlotAttributes<Message>
  readonly handle: SlotAttributes<Message>
  readonly body: SlotAttributes<Message>
  /** For an element of the application's own that drags the panel too, such as its tabs' row. */
  readonly grip: SlotAttributes<Message>
}

export interface DrawerView<Outer> {
  readonly model: Model
  /** Lifts the Drawer's Messages into the application's. */
  readonly onMessage: (message: Message) => NoInfer<Outer>
  /** What the handle is called, open and peeking: a bar alone says nothing. */
  readonly labels: { readonly open: string; readonly closed: string }
  /** A style of `DrawerSlots` (`Recipes.Drawer`). */
  readonly style?: NamedStyle<typeof DrawerSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Outer> | undefined
  /**
   * Draws the panel; the handle goes in it, ahead of the body, which may sit
   * below what else peeks with the handle. The panel's inline style is the drag's: set
   * `--fk-drawer-height` and `--fk-drawer-peek` on an ancestor or in a style.
   */
  readonly draw: (drawer: ResolvedDrawer<Outer>) => Html
}

export const view = <Outer>(options: DrawerView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const { model, onMessage } = options
  const builders = SlotView.buildersFor(
    DrawerSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const swipe = (from: Origin) =>
    // A grip holds controls of its own: a press that stays put is their click.
    Mount.mapMessage(
      Swipe({ measure: '[data-drawer]', slop: from === 'grip' ? PRESS_SLOP : 0 }),
      fact =>
        onMessage(
          Match.valueTags(fact, {
            SwipeStarted: ({ height }) => Message.Grabbed({ size: height, from }),
            Swiped: ({ deltaY }) => Message.Dragged({ delta: deltaY }),
            SwipeEnded: ({ deltaY, velocityY, completed }) =>
              Message.Released({ delta: deltaY, velocity: velocityY, completed }),
          }),
        ),
    )
  const dragging = Option.match(model.drag, {
    onNone: () => [],
    onSome: drag => [
      h.DataAttribute('dragging', ''),
      h.Style({
        '--fk-drawer-offset': `${drag.delta}px`,
        '--fk-drawer-progress': String(progress(model, drag)),
      }),
    ],
  })
  return options.draw({
    panel: builders.panel.attrs([
      h.DataAttribute('drawer', ''),
      h.DataAttribute('open', String(model.open)),
      ...dragging,
    ]),
    handle: builders.handle.attrs([
      h.Type('button'),
      h.AriaExpanded(model.open),
      h.AriaControls(model.id),
      h.AriaLabel(model.open ? options.labels.open : options.labels.closed),
      // The browser's own pan would take the press away from the drag.
      h.Style({ touchAction: 'none' }),
      h.OnMount(swipe('handle')),
      h.OnClick(onMessage(Message.Pressed())),
    ]),
    body: builders.body.attrs([h.Id(model.id)]),
    // Sideways stays the browser's, so a row of tabs still scrolls; up and down drag.
    grip: builders.grip.attrs([h.Style({ touchAction: 'pan-x' }), h.OnMount(swipe('grip'))]),
  })
}
