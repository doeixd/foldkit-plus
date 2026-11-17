/**
 * The swipeable row as one SlotView. The face (the row you see) carries a
 * `Swipe` Mount for the pointer; the root owns one `keydown` for the keyboard's
 * way in, `SwipeActions.keys`, so an arrow or Escape reaches it from the face
 * or from an action behind it. The actions behind a closed row are `inert`,
 * and `FocusRecovery` hands focus back to the face when the row closes on the
 * action that held it.
 */
import { Effect, Match, Option, Queue, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import {
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  Style,
} from 'foldkit-mixins'
import { Swipe } from 'foldkit-primitives/dom'
import { FocusRecovery, SwipeActions } from 'foldkit-primitives/interaction'
import { control, focus, muted, panel, t } from '../style.js'
import { ACTION_SHARE, Message, Row, actionsOn, type Action, type Model } from './app.js'

const { Keys } = Behaviors

export const SwipeSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  startActions: Slot.make({ capability: Capability.Container }),
  endActions: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Interactive }),
  face: Slot.make({ capability: Capability.Focusable }),
  title: Slot.make({ capability: Capability.Container }),
  hint: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
})

const Swiper = SlotView.over(SwipeSlots)<Model, Message>()

const LABELS: Readonly<Record<Action, string>> = {
  pin: 'Pin',
  archive: 'Archive',
  delete: 'Delete',
}
const DONE: Readonly<Record<Action, string>> = {
  pin: 'Pinned',
  archive: 'Archived',
  delete: 'Deleted',
}

/** Focus going from the row or its actions to an element outside both: the actions are put away. */
const LeftRow = Mount.defineStream('SwipeRowLeft', {
  messages: [Message.FocusLeft],
  execute: ({ element }) =>
    Stream.callback<ReturnType<typeof Message.FocusLeft>>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const left = (event: globalThis.Event) => {
            const to = event instanceof FocusEvent ? event.relatedTarget : null
            if (to instanceof Node && !element.contains(to))
              Queue.offerUnsafe(queue, Message.FocusLeft())
          }
          element.addEventListener('focusout', left)
          return left
        }),
        left => Effect.sync(() => element.removeEventListener('focusout', left)),
      ),
    ),
})

export const Dragging = Behavior.forSlots(SwipeSlots)<Model, Message>(
  {
    face: Behavior.slot({
      requires: { capability: Capability.Focusable },
      attributes: ({ input, h }) => [
        ...Option.match(input.row.open, {
          onNone: () => [],
          onSome: side => [h.DataAttribute('swipe', side)],
        }),
        ...Option.match(input.offset, {
          onNone: () => [],
          onSome: px => [h.DataAttribute('dragging', ''), h.Style({ '--swipe-offset': `${px}px` })],
        }),
      ],
      // A press that stays put is still a click; a few pixels separate the two.
      mount: () =>
        Mount.mapMessage(Swipe({ slop: 6 }), fact =>
          Match.valueTags(fact, {
            SwipeStarted: ({ width }) => Message.Grabbed({ width }),
            Swiped: ({ deltaX }) => Message.Dragged({ deltaX }),
            SwipeEnded: ({ deltaX, velocityX, completed }) =>
              Message.LetGo({ deltaX, velocityX, completed }),
          }),
        ),
    }),
  },
  { name: 'Dragging' },
)

export const Leaves = Behavior.forSlots(SwipeSlots)<Model, Message>(
  { root: Behavior.slot({ mount: () => LeftRow() }) },
  { name: 'Leaves' },
)

export const SwipeKeys = Keys.behavior(Swiper)({
  slot: 'root',
  name: 'SwipeKeys',
  routes: [
    SwipeActions.keys<Model, Message>({
      open: model => model.row.open,
      rtl: false,
      toMessage: message => Row.wrapper.make(message),
    }),
  ],
})

/** An action that closes the row loses focus to the face, which sits beside it. */
export const Recovers = FocusRecovery.behavior(Swiper)({
  owner: 'root',
  parts: { action: [{ part: 'face' }], face: [] },
})

export const SwipeStyle = Style.forSlots(SwipeSlots)(
  {
    root: Style.compose(
      panel,
      Style.self({ position: 'relative', inlineSize: '24rem', display: 'grid' }),
    ),
    startActions: Style.self({
      position: 'absolute',
      insetBlock: '0',
      insetInlineStart: '0',
      inlineSize: `${ACTION_SHARE * 100}%`,
      display: 'flex',
    }),
    endActions: Style.self({
      position: 'absolute',
      insetBlock: '0',
      insetInlineEnd: '0',
      inlineSize: `${ACTION_SHARE * 100}%`,
      display: 'flex',
    }),
    action: Style.compose(control, focus, Style.self({ flex: '1', borderRadius: '0' })),
    face: Style.compose(
      focus,
      Style.self({
        position: 'relative',
        // Above the actions, which come after it in the document so Tab reaches them from the face.
        zIndex: '1',
        padding: t.space.sm,
        background: t.surface.base,
        // The browser keeps the vertical pan; the sideways drag is the row's.
        touchAction: 'pan-y',
        userSelect: 'none',
        transitionProperty: 'transform',
        transitionDuration: `calc(${t.motion.fast} * ${t.knob.travel})`,
      }),
      // physical: this row is drawn left to right only (`rtl: false` in its keys)
      Style.pseudo('[data-swipe="start"]', { transform: `translateX(${ACTION_SHARE * 100}%)` }),
      // physical: as above
      Style.pseudo('[data-swipe="end"]', { transform: `translateX(-${ACTION_SHARE * 100}%)` }),
      Style.pseudo('[data-dragging]', {
        // physical: the pointer's travel in pixels
        transform: 'translateX(var(--swipe-offset))',
        transitionDuration: '0s',
      }),
    ),
    title: Style.self({ fontWeight: t.weight.bold }),
    hint: Style.self({ color: muted }),
    status: Style.self({ color: muted }),
  },
  { name: 'SwipeStyle' },
)

export const SwipeRow = Swiper.define((model, slots, h) => {
  const open = model.row.open
  const actions = (side: SwipeActions.Side) =>
    actionsOn(side).map(action =>
      h.button(
        slots.action.attrs([h.Type('button'), h.Key(action), h.OnClick(Message.Acted({ action }))]),
        [LABELS[action]],
      ),
    )
  return h.div(slots.root.attrs([]), [
    h.div(
      slots.face.attrs([
        h.Role('group'),
        h.AriaLabel('Invoice from Acme'),
        h.Tabindex(0),
        h.AriaDescribedBy('swipe-hint'),
      ]),
      [
        h.div(slots.title.attrs([]), ['Invoice from Acme']),
        h.div(slots.hint.attrs([h.Id('swipe-hint')]), [
          'Swipe, or press the left or right arrow, for actions.',
        ]),
        h.div(slots.status.attrs([h.Role('status')]), [
          Option.match(model.done, { onNone: () => 'Nothing done yet.', onSome: a => DONE[a] }),
        ]),
      ],
    ),
    h.div(
      slots.startActions.attrs([
        h.Role('group'),
        h.AriaLabel('Start actions'),
        h.Inert(!Option.contains(open, 'start')),
      ]),
      actions('start'),
    ),
    h.div(
      slots.endActions.attrs([
        h.Role('group'),
        h.AriaLabel('End actions'),
        h.Inert(!Option.contains(open, 'end')),
      ]),
      actions('end'),
    ),
  ])
}).pipe(
  Behavior.attach(Dragging),
  Behavior.attach(SwipeKeys),
  Behavior.attach(Leaves),
  Behavior.attach(Recovers),
  Style.attach(SwipeStyle),
)
