/**
 * A Sheet: a dialog pinned to an edge of the viewport, which its handle drags
 * between resting points and, past the last, away, after vaul's Drawer. It is
 * `@foldkit/ui`'s Dialog (focus trap, Escape, the backdrop's dismissal,
 * scroll lock, stacking) with a small Model of this module's beside it: the
 * edge, the points it rests at, which one it rests at, and the drag running.
 *
 * ```text
 * handle: Swipe -> Grabbed / Dragged / Released -> update -> point, or close
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
 * there. The handle is hidden from assistive technology, which has Escape
 * and the sheet's own controls. Reduced motion keeps the drag (it follows
 * the finger) and snaps the slide. How fast a flick is and how far a slow
 * drag takes it away are `swipe.flickSpeed` and `swipe.closeShare`.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import { Match, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { Swipe } from 'foldkit-primitives/dom'
import { resolve as resolveDialog, type ResolvedDialog } from './dialog.js'
import type { MixinList } from './resolve.js'

export const Side = Schema.Literals(['top', 'right', 'bottom', 'left'])
export type Side = typeof Side.Type

/** Where a drag starts: anywhere on the panel for a finger, or the handle alone. */
export const SwipeFrom = Schema.Literals(['panel', 'handle'])
export type SwipeFrom = typeof SwipeFrom.Type

export const Model = Schema.Struct({
  dialog: UiDialog.Model,
  side: Side,
  /** How much of the panel shows at each point it rests at, ascending, each above 0 and at most 1. */
  points: Schema.Array(Schema.Number),
  /**
   * The point it rests at, an index into `points`. Not `at`, a name a
   * Surface's ModelRef reserves, so the Model can stand in any application's.
   */
  point: Schema.Number,
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
})
export type Message = typeof Message.Type

/** The default `flickSpeed`: a release faster than this, in pixels a millisecond, is a flick (vaul's 0.4). */
export const FLICK_SPEED = 0.4
/** The default `closeShare`: the share of the panel a slow drag takes it away by (vaul's 0.25). */
export const CLOSE_SHARE = 0.25
/** A press on the handle that moves less than this, in pixels, is a press, not a drag. */
export const PRESS_SLOP = 4

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

/** How a Sheet or a Drawer is swiped; every field has the default its doc names. */
export interface SwipeConfig {
  /** Where a drag starts: `panel` (a finger anywhere on it, the default) or `handle`. */
  readonly from?: SwipeFrom
  /** How fast, in pixels a millisecond, a release must be to be a flick. Default `FLICK_SPEED`. */
  readonly flickSpeed?: number
  /** The share of the panel, from 0 to 1, a slow drag takes it away by. Default `CLOSE_SHARE`. */
  readonly closeShare?: number
}

/** `config`'s fields with their defaults, refusing a speed that is not above 0 or a share outside (0, 1]. */
export const swipeOf = (id: string, config: SwipeConfig = {}) => {
  const flickSpeed = config.flickSpeed ?? FLICK_SPEED
  const closeShare = config.closeShare ?? CLOSE_SHARE
  if (!(flickSpeed > 0))
    throw new Error(`${id}: swipe.flickSpeed must be above 0, given ${flickSpeed}`)
  if (!(closeShare > 0 && closeShare <= 1)) {
    throw new Error(`${id}: swipe.closeShare must be within (0, 1], given ${closeShare}`)
  }
  return { swipeFrom: config.from ?? ('panel' as const), flickSpeed, closeShare }
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
    point: opensAt,
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
  fields: { readonly point?: number } = {},
): Return => {
  // A drag ends with the Dialog opening or closing, and outlives the rest of its Messages:
  // grabbed as the panel slid in, it met the animation's end, which dropped it.
  const ends = next.model.isOpen !== model.dialog.isOpen || fields.point !== undefined
  return {
    model:
      next.model === model.dialog && fields.point === undefined
        ? model
        : modifyFields(model, {
            dialog: () => next.model,
            drag: drag => (ends ? Option.none() : drag),
            point: point => fields.point ?? point,
          }),
    commands: Command.mapMessages(next.commands, message => Message.GotDialog({ message })),
    ...(next.outMessage === undefined ? {} : { outMessage: next.outMessage }),
  }
}

/** Opens the Sheet at its `opensAt` point. */
export const open = (model: Model): Return =>
  dialogStep(model, UiDialog.open(model.dialog), { point: model.opensAt })

/** Closes the Sheet; a no-op when it is closed. */
export const close = (model: Model): Return => dialogStep(model, UiDialog.close(model.dialog))

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

/** The Sheet after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return =>
  Message.match(message, {
    GotDialog: ({ message }) => dialogStep(model, UiDialog.update(model.dialog, message)),
    Grabbed: ({ size }) => ({
      model: modifyFields(model, { drag: () => Option.some({ size, delta: 0 }) }),
    }),
    Dragged: ({ delta }) =>
      Option.match(model.drag, {
        onNone: () => ({ model }),
        onSome: drag =>
          drag.delta === delta
            ? { model }
            : { model: modifyFields(model, { drag: () => Option.some({ ...drag, delta }) }) },
      }),
    Released: ({ delta, velocity, completed }) =>
      Option.match(model.drag, {
        onNone: () => ({ model }),
        onSome: ({ size }) => {
          const resting = modifyFields(model, { drag: () => Option.none() })
          if (!completed) return { model: resting }
          if (Math.abs(delta) < PRESS_SLOP && Math.abs(velocity) <= model.flickSpeed) {
            const next = (model.point + 1) % model.points.length
            return {
              model: next === model.point ? resting : modifyFields(resting, { point: () => next }),
            }
          }
          return Option.match(settle({ ...model, at: model.point, size, delta, velocity }), {
            onNone: () => close(resting),
            onSome: at => ({
              model: at === model.point ? resting : modifyFields(resting, { point: () => at }),
            }),
          })
        },
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
  const shown = hiddenAt(model.points, model.point, drag.size) + drag.delta
  return shown >= 0 ? shown : -Math.max(0, 8 * (Math.log(1 - shown) - 2))
}

export interface SheetView<Outer> {
  readonly model: Model
  /** Lifts the Sheet's Messages into the application's. */
  readonly onMessage: (message: Message) => NoInfer<Outer>
  /** The style (`Recipes.Sheet`) and any other mixins, on `DialogSlots`. */
  readonly mixins?: MixinList<Outer>
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
 * what matters shows at the lowest.
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
          resolveDialog(render, options.mixins ?? [], {
            h,
            covered: options.covered ?? false,
            attributes: {
              dialog: [h.DataAttribute('side', model.side)],
              panel: [
                h.DataAttribute('sheet', model.side),
                ...(options.scalesPage === true ? [h.DataAttribute('scales-page', '')] : []),
                h.Style({ '--fk-sheet-snap': String(model.points[model.point] ?? 1) }),
                // A sheet resting partway takes its full extent, so a point is
                // a share of that and not of a panel only as tall as its content.
                ...(model.points.some(point => point < 1) ? [h.DataAttribute('snaps', '')] : []),
                // Below its highest point a swipe up raises it, so its content holds still.
                ...(model.point < model.points.length - 1 ? [h.DataAttribute('lowered', '')] : []),
                ...(model.swipeFrom === 'panel' ? [h.OnMount(swipe(true))] : []),
                ...place,
              ],
              // The browser's own pan would take the press away from the drag.
              handle: [h.Style({ touchAction: 'none' }), h.OnMount(swipe(false))],
            },
          }),
        ),
    },
    toParentMessage: message => onMessage(Message.GotDialog({ message })),
  })
}
