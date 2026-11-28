/**
 * A Sheet: a dialog pinned to an edge of the viewport, which its handle drags
 * between resting points and, past the last, away, after vaul's Drawer. It is
 * `@foldkit/ui`'s Dialog (focus trap, Escape, the backdrop's dismissal,
 * scroll lock, stacking) with a small Model of this module's beside it: the
 * edge, the points it rests at, which one it rests at, and the drag running.
 *
 * ```text
 * handle: Swipe -> Grabbed / Dragged / Released -> update -> point, or close
 * handle keys: Home / End / arrows -> SnappedTo -> update -> point
 * view: point -> --fk-sheet-snap; a drag -> --fk-sheet-offset -> the recipe's translate
 * ```
 *
 * A point is how much of the panel shows, from 0 to 1, so a point is a share
 * of the panel and the CSS needs no measure; a drag is read against the
 * panel's size, which the handle's `Swipe` measures as it starts. Let go, a
 * flick (faster than `FLICK_SPEED`) goes on to the next point its way, or
 * away past the last; a slower release rests at the nearest point, or goes
 * away once dragged `CLOSE_SHARE` of the way out from the lowest. A drag
 * past fully open is damped, as vaul's is. A press on the handle that
 * barely moves steps to the next point, round to the first.
 *
 * A finger drags it from anywhere on the panel (`swipe.from: 'panel'`, the
 * default): content that can still scroll the way the finger moves scrolls,
 * and once it is at its end the finger takes the sheet, as vaul's does, so a
 * long sheet scrolls back to its top and then closes. A field, a slider and
 * `data-no-swipe` start no drag, and resting below its highest point the
 * panel does not scroll, so a swipe up raises it. A mouse drags it by the
 * handle, where text stays selectable; `from: 'handle'` keeps every pointer
 * there. With more than one point the handle is also a focusable separator
 * whose arrow keys, Home and End step between the points (`SnappedTo`); with
 * one it is hidden from assistive technology, which has Escape and the
 * sheet's own controls. Reduced motion keeps the drag (it follows the
 * finger) and snaps the slide. How fast a flick is and how far a slow
 * drag takes it away are `swipe.flickSpeed` and `swipe.closeShare`.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import { Match, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import type { NamedStyle } from 'foldkit-mixins'
import { Swipe } from 'foldkit-primitives/dom'
import {
  DialogSlots,
  isLeaving,
  close as closeDialog,
  open as openDialog,
  resolve as resolveDialog,
  update as updateDialog,
  type ResolvedDialog,
} from './dialog.js'
import { Arr, Bool, Eq, Ord, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import type { MixinList } from './resolve.js'
import {
  CLOSE_SHARE,
  FLICK_SPEED,
  PRESS_SLOP,
  SwipeFrom,
  swipeOf,
  type SwipeConfig,
} from './swipe.js'

export { CLOSE_SHARE, FLICK_SPEED, PRESS_SLOP, SwipeFrom, swipeOf, type SwipeConfig }

export const Side = Schema.Literals(['top', 'right', 'bottom', 'left'])
export type Side = typeof Side.Type

export const Model = Schema.Struct({
  dialog: UiDialog.Model,
  side: Side,
  /** How much of the panel shows at each point it rests at, ascending, each above 0 and at most 1. */
  points: Schema.Array(Schema.Number),
  /** The point it rests at, an index into `points`. */
  at: Schema.Number,
  /** The point it opens at. */
  opensAt: Schema.Number,
  /** Whether a drag may take it away; Escape and the backdrop are the Dialog's. */
  dismissible: Schema.Boolean,
  /** Where a drag starts. */
  swipeFrom: SwipeFrom,
  /** A release faster than this, in pixels a millisecond, goes on to the next point. */
  flickSpeed: Schema.Number,
  /** The share of what shows at the lowest point that a slow drag takes it away by. */
  closeShare: Schema.Number,
  /**
   * While a drag runs: the panel's size along its side as it began, and how
   * far it has come toward the edge, in pixels (negative is away from it).
   */
  drag: Schema.Option(Schema.Struct({ size: Schema.Number, delta: Schema.Number })),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotDialog: { message: UiDialog.Message },
  /** The handle was pressed; `size` is the panel's along its side. */
  Grabbed: { size: Schema.Number },
  /** Toward the edge, from where the press began. */
  Dragged: { delta: Schema.Number },
  /** Let go: the last delta and its speed toward the edge, or cancelled. */
  Released: { delta: Schema.Number, velocity: Schema.Number, completed: Schema.Boolean },
  /** The sheet is to rest at point `at`, an index into `points`, as a release there leaves it. */
  SnappedTo: { at: Schema.Number },
})
export type Message = typeof Message.Type

export interface InitConfig {
  /** The Dialog's id, unique in the document. */
  readonly id: string
  /** The edge it comes from. Default `bottom`. */
  readonly side?: Side
  /** How much of the panel shows at each resting point, ascending. Default `[1]`. */
  readonly points?: ReadonlyArray<number>
  /** The index in `points` it opens at. Default 0, the lowest. */
  readonly opensAt?: number
  /** Whether a drag may take it away. Default true. */
  readonly dismissible?: boolean
  /** Whether it slides in and out. Default true. */
  readonly isAnimated?: boolean
  /** How it is swiped. */
  readonly swipe?: SwipeConfig
}

/** A closed Sheet. Throws on points that are empty, out of order or out of (0, 1], or an `opensAt` among none. */
export const init = (config: InitConfig): Model => {
  const points = config.points ?? [1]
  const opensAt = config.opensAt ?? 0
  const ordered = points.every((point, index) => index === 0 || point > (points[index - 1] ?? 0))
  if (points.length === 0 || !ordered || points.some(point => point <= 0 || point > 1)) {
    throw new Error(`Sheet ${config.id}: points must ascend within (0, 1], given ${points}`)
  }
  if (!Number.isInteger(opensAt) || opensAt < 0 || opensAt >= points.length) {
    throw new Error(
      `Sheet ${config.id}: opensAt ${opensAt} is not one of the ${points.length} points`,
    )
  }
  return {
    dialog: UiDialog.init({ id: config.id, isAnimated: config.isAnimated ?? true }),
    side: config.side ?? 'bottom',
    points,
    at: opensAt,
    opensAt,
    dismissible: config.dismissible ?? true,
    ...swipeOf(`Sheet ${config.id}`, config.swipe),
    drag: Option.none(),
  }
}

/** The Sheet's step: its Model, its Commands, and the Dialog's `Opened` or `Closed`. */
export type Return = ReturnWithOutMessage<Model, Message, UiDialog.OutMessage>

const dialogStep = (
  model: Model,
  next: ReturnWithOutMessage<UiDialog.Model, UiDialog.Message, UiDialog.OutMessage>,
  fields: { readonly at?: number } = {},
): Return => {
  // A drag ends with the Dialog opening or closing, and outlives the rest of its Messages:
  // grabbed as the panel slid in, it met the animation's end, which dropped it.
  const ends = next.model.isOpen !== model.dialog.isOpen || fields.at !== undefined
  return {
    model:
      next.model === model.dialog && fields.at === undefined
        ? model
        : modifyFields(model, {
            dialog: () => next.model,
            drag: drag => (ends ? Option.none() : drag),
            at: at => fields.at ?? at,
          }),
    commands: Command.mapMessages(next.commands, message => Message.GotDialog({ message })),
    ...(next.outMessage === undefined ? {} : { outMessage: next.outMessage }),
  }
}

/** Opens the Sheet at its `opensAt` point. */
export const open = (model: Model): Return =>
  dialogStep(model, openDialog(model.dialog), { at: model.opensAt })

/** Closes the Sheet; a no-op when it is closed. */
export const close = (model: Model): Return => dialogStep(model, closeDialog(model.dialog))

/** How far, in pixels, the panel is drawn in from fully open at point `index`. */
const hiddenAt = (points: ReadonlyArray<number>, index: number, size: number): number =>
  (1 - (points[index] ?? 1)) * size

/**
 * Where a release comes to rest: the index of a point, or none to go away.
 * Pure, for the reasons in the module's comment; `delta` and `velocity` are
 * toward the edge.
 */
export const settle = (release: {
  readonly points: ReadonlyArray<number>
  readonly at: number
  readonly size: number
  readonly delta: number
  readonly velocity: number
  readonly dismissible: boolean
  readonly flickSpeed: number
  readonly closeShare: number
}): Option.Option<number> => {
  const { points, at, size, delta, velocity, dismissible, flickSpeed, closeShare } = release
  const indices = points.map((_, index) => index)
  const now = hiddenAt(points, at, size) + delta
  const hidden = (index: number) => hiddenAt(points, index, size)
  if (velocity > flickSpeed) {
    // Toward the edge: the highest point still further out than where it is.
    const next = indices.filter(index => hidden(index) > now).at(-1)
    return next !== undefined ? Option.some(next) : dismissible ? Option.none() : Option.some(0)
  }
  if (velocity < -flickSpeed) {
    const next = indices.find(index => hidden(index) < now)
    return Option.some(next ?? points.length - 1)
  }
  const lowest = hidden(0)
  if (dismissible && now - lowest >= closeShare * (size - lowest)) return Option.none()
  const nearest = indices.reduce((best, index) =>
    Math.abs(hidden(index) - now) < Math.abs(hidden(best) - now) ? index : best,
  )
  return Option.some(nearest)
}

/**
 * The Sheet's declarative state machine: `GotDialog`, `Grabbed`, `Dragged`,
 * `Released`, and `SnappedTo` with exact read/write footprints, ready for
 * `Machine.lift` in an application's composed machine.
 */
export const machine = /* @__PURE__ */ Machine.make({
  state: Model,
  transitions: {
    GotDialog: /* @__PURE__ */ Transition.opaque({
      name: 'Sheet.GotDialog',
      state: Model,
      input: Schema.Struct({ message: UiDialog.Message }),
      reads: ({ state, input }) => [
        state.dialog,
        state.opensAt,
        state.drag,
        state.at,
        input.message,
      ],
      writes: ({ state }) => [state.dialog, state.drag, state.at],
      run: (model, { message }) =>
        dialogStep(
          model,
          updateDialog(model.dialog, message),
          Match.value(message).pipe(
            Match.tag('RequestedOpen', () => (model.dialog.isOpen ? {} : { at: model.opensAt })),
            Match.orElse(() => ({})),
          ),
        ).model,
    }),
    Grabbed: /* @__PURE__ */ Transition.opaque({
      name: 'Sheet.Grabbed',
      state: Model,
      input: Schema.Struct({ size: Schema.Number }),
      reads: ({ input }) => [input.size],
      writes: ({ state }) => [state.drag],
      run: (model, { size }) =>
        modifyFields(model, { drag: () => Option.some({ size, delta: 0 }) }),
    }),
    Dragged: /* @__PURE__ */ Transition.opaque({
      name: 'Sheet.Dragged',
      state: Model,
      input: Schema.Struct({ delta: Schema.Number }),
      reads: ({ state, input }) => [state.drag, input.delta],
      writes: ({ state }) => [state.drag],
      run: (model, { delta }) =>
        Option.match(model.drag, {
          onNone: () => model,
          onSome: drag =>
            drag.delta === delta
              ? model
              : modifyFields(model, { drag: () => Option.some({ ...drag, delta }) }),
        }),
    }),
    Released: /* @__PURE__ */ Transition.opaque({
      name: 'Sheet.Released',
      state: Model,
      input: Schema.Struct({
        delta: Schema.Number,
        velocity: Schema.Number,
        completed: Schema.Boolean,
      }),
      reads: ({ state, input }) => [
        state.drag,
        state.at,
        state.points,
        state.dismissible,
        state.flickSpeed,
        state.closeShare,
        state.dialog,
        input.delta,
        input.velocity,
        input.completed,
      ],
      writes: ({ state }) => [state.drag, state.at, state.dialog],
      run: (model, { delta, velocity, completed }) =>
        Option.match(model.drag, {
          onNone: () => model,
          onSome: ({ size }) => {
            const resting = modifyFields(model, { drag: () => Option.none() })
            if (!completed) return resting
            if (Math.abs(delta) < PRESS_SLOP && Math.abs(velocity) <= model.flickSpeed) {
              const next = (model.at + 1) % model.points.length
              return next === model.at ? resting : modifyFields(resting, { at: () => next })
            }
            return Option.match(settle({ ...model, size, delta, velocity }), {
              onNone: () => close(resting).model,
              onSome: at => (at === model.at ? resting : modifyFields(resting, { at: () => at })),
            })
          },
        }),
    }),
    SnappedTo: /* @__PURE__ */ Transition.make({
      state: Model,
      input: Schema.Struct({ at: Schema.Int }),
      when: ({ state, input }) =>
        Bool.and(
          Bool.and(Ord.gte(input.at, 0), Ord.lt(input.at, Arr.count(state.points))),
          Eq.isNot(input.at, state.at),
        ),
      apply: ({ state, input }) => [Transition.set(state.at, input.at)],
    }),
  },
})

/** The Sheet after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return =>
  Message.match(message, {
    // An open, from the application's button as from `open`, rests at the point it opens at.
    GotDialog: ({ message }) =>
      dialogStep(
        model,
        updateDialog(model.dialog, message),
        Match.value(message).pipe(
          Match.tag('RequestedOpen', () => (model.dialog.isOpen ? {} : { at: model.opensAt })),
          Match.orElse(() => ({})),
        ),
      ),
    Grabbed: ({ size }) => ({
      model: machine.update(model, { _tag: 'Grabbed', input: { size } })[0],
    }),
    Dragged: ({ delta }) => ({
      model: machine.update(model, { _tag: 'Dragged', input: { delta } })[0],
    }),
    Released: ({ delta, velocity, completed }) =>
      Option.match(model.drag, {
        onNone: () => ({ model }),
        onSome: ({ size }) => {
          const resting = modifyFields(model, { drag: () => Option.none() })
          if (!completed) return { model: resting }
          if (Math.abs(delta) < PRESS_SLOP && Math.abs(velocity) <= model.flickSpeed) {
            return {
              model: machine.update(model, {
                _tag: 'Released',
                input: { delta, velocity, completed },
              })[0],
            }
          }
          return Option.match(settle({ ...model, size, delta, velocity }), {
            onNone: () => close(resting),
            onSome: () => ({
              model: machine.update(model, {
                _tag: 'Released',
                input: { delta, velocity, completed },
              })[0],
            }),
          })
        },
      }),
    SnappedTo: ({ at }) => ({
      model: machine.update(model, { _tag: 'SnappedTo', input: { at } })[0],
    }),
  })

/** Whether the Sheet is open, for a parent's `covered` or its own reading. */
export const isOpen = (model: Model): boolean => model.dialog.isOpen

/** The sign that turns a pointer's movement into movement toward the edge, and its axis. */
const toward: Record<Side, { readonly axis: 'x' | 'y'; readonly sign: 1 | -1 }> = {
  top: { axis: 'y', sign: -1 },
  right: { axis: 'x', sign: 1 },
  bottom: { axis: 'y', sign: 1 },
  left: { axis: 'x', sign: -1 },
}

/**
 * How far in from fully open the panel is drawn during a drag: the drag
 * itself, but damped past fully open as vaul's (`8 * (ln(x + 1) - 2)`), so
 * the sheet gives a little and resists.
 */
export const dragged = (model: Model, drag: { readonly size: number; readonly delta: number }) => {
  const shown = hiddenAt(model.points, model.at, drag.size) + drag.delta
  return shown >= 0 ? shown : -Math.max(0, 8 * (Math.log(1 - shown) - 2))
}

export interface SheetWords {
  /** The handle's accessible name when the sheet has points; default `Resize sheet`. */
  readonly handle?: string | undefined
}

export interface SheetView<Outer> {
  readonly model: Model
  /** Lifts the Sheet's Messages into the application's. */
  readonly onMessage: (message: Message) => NoInfer<Outer>
  /** A style of `DialogSlots` (`Recipes.Sheet`), for the sheet's look. */
  readonly style?: NamedStyle<typeof DialogSlots> | undefined
  /** Mixins beside the style, on `DialogSlots`. */
  readonly mixins?: MixinList<Outer>
  /** The handle's words. */
  readonly words?: SheetWords | undefined
  /** As the Dialog's: whether `description` labels the dialog. */
  readonly hasDescription?: boolean
  /** As the Dialog's: a sheet opened from this one is above it. */
  readonly covered?: boolean
  /**
   * Marks the open panel `data-scales-page`, for `Recipes.sheetPage` on the
   * application's page to step back behind it, as vaul's
   * `shouldScaleBackground`.
   */
  readonly scalesPage?: boolean
  readonly draw: (sheet: ResolvedDialog<Outer>) => Html
}

/**
 * The Sheet: `@foldkit/ui`'s Dialog view, its bundles resolved as the
 * Dialog's are, with the drag on the handle and its place on the panel.
 * Draw `handle` in the panel; a sheet with points draws its content so that
 * what matters shows at the lowest. With more than one point the handle is a
 * focusable separator: its arrow keys (the one that raises it, and the one that
 * lowers it, by the side), Home and End send `SnappedTo` as a release at that
 * point does, and it does not close the sheet: Escape is the Dialog's.
 */
export const view = <Outer>(options: SheetView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const { model, onMessage } = options
  const { axis, sign } = toward[model.side]
  const along = (x: number, y: number) => sign * (axis === 'x' ? x : y)
  const swipe = (panel: boolean) =>
    Mount.mapMessage(
      // A finger on the panel yields to content that scrolls; a mouse keeps to the handle.
      Swipe(
        panel
          ? { measure: '[data-sheet]', scrolls: axis, touchOnly: true, slop: PRESS_SLOP }
          : { measure: '[data-sheet]' },
      ),
      fact =>
        onMessage(
          Match.valueTags(fact, {
            SwipeStarted: ({ width, height }) =>
              Message.Grabbed({ size: axis === 'x' ? width : height }),
            Swiped: ({ deltaX, deltaY }) => Message.Dragged({ delta: along(deltaX, deltaY) }),
            SwipeEnded: ({ deltaX, deltaY, velocityX, velocityY, completed }) =>
              Message.Released({
                delta: along(deltaX, deltaY),
                velocity: along(velocityX, velocityY),
                completed,
              }),
          }),
        ),
    )
  const snapping = model.points.length > 1
  const last = model.points.length - 1
  const percent = (index: number) => Math.round((model.points[index] ?? 1) * 100)
  // The step from ArrowDown and ArrowRight raises a top and a left sheet; a bottom and a right
  // sheet are raised by the other arrow of the axis, so their arrows step the other way.
  const raising = model.side === 'top' || model.side === 'left' ? 1 : -1
  const stepKeys = axis === 'y' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
  // A plain `OnKeyDownPreventDefault`, not `Behaviors.Keys`: the router and the roving-tabindex
  // helpers weigh more than this one handler, and a page whose sheets have one point never draws it.
  const snapTo = (key: string, modifiers: KeyboardModifiers): Option.Option<number> => {
    if (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey) return Option.none()
    if (key === 'Home') return Option.some(0)
    if (key === 'End') return Option.some(last)
    const step = key === stepKeys[1] ? raising : key === stepKeys[0] ? -raising : 0
    return step === 0 ? Option.none() : Option.some(Math.min(last, Math.max(0, model.at + step)))
  }
  const place = Option.match(model.drag, {
    onNone: () => [],
    onSome: drag => [
      h.DataAttribute('dragging', ''),
      h.Style({ '--fk-sheet-offset': `${dragged(model, drag)}px` }),
    ],
  })
  return h.submodel({
    slotId: model.dialog.id,
    model: model.dialog,
    view: UiDialog.view,
    viewInputs: {
      hasDescription: options.hasDescription ?? false,
      toView: (render: UiDialog.RenderInfo) =>
        options.draw(
          resolveDialog(
            render,
            [
              ...(options.style === undefined ? [] : [options.style.mixin]),
              ...(options.mixins ?? []),
            ],
            {
              h,
              covered: options.covered ?? false,
              isLeaving: isLeaving(model.dialog),
              interactiveHandle: snapping,
              attributes: {
                dialog: [h.DataAttribute('side', model.side)],
                panel: [
                  h.DataAttribute('sheet', model.side),
                  ...(options.scalesPage === true ? [h.DataAttribute('scales-page', '')] : []),
                  h.Style({ '--fk-sheet-snap': String(model.points[model.at] ?? 1) }),
                  // A sheet resting partway takes its full extent, so a point is
                  // a share of that and not of a panel only as tall as its content.
                  ...(model.points.some(point => point < 1) ? [h.DataAttribute('snaps', '')] : []),
                  // Below its highest point a swipe up raises it, so its content holds still.
                  ...(model.at < model.points.length - 1 ? [h.DataAttribute('lowered', '')] : []),
                  ...(model.swipeFrom === 'panel' ? [h.OnMount(swipe(true))] : []),
                  ...place,
                ],
                // The browser's own pan would take the press away from the drag.
                handle: [
                  h.Style({ touchAction: 'none' }),
                  h.OnMount(swipe(false)),
                  ...(snapping
                    ? [
                        h.Role('separator'),
                        h.Tabindex(0),
                        h.AriaLabel(options.words?.handle ?? 'Resize sheet'),
                        // A separator's orientation is the line it draws, across the sheet's edge.
                        h.AriaOrientation(axis === 'y' ? 'horizontal' : 'vertical'),
                        h.AriaValuenow(percent(model.at)),
                        h.AriaValuemin(percent(0)),
                        h.AriaValuemax(percent(last)),
                        h.AriaControls(`${model.dialog.id}-panel`),
                        h.OnKeyDownPreventDefault((key, modifiers) =>
                          Option.map(snapTo(key, modifiers), at =>
                            onMessage(Message.SnappedTo({ at })),
                          ),
                        ),
                      ]
                    : []),
                ],
              },
            },
          ),
        ),
    },
    toParentMessage: message => onMessage(Message.GotDialog({ message })),
  })
}
