/**
 * Swipe-to-reveal actions behind a row, with a way in that needs no pointer:
 * which row side is open, what a release of a `Swipe` means (open, close, or
 * run the first action at once), and the keys that do the same (an arrow opens
 * the side it reveals, the opposite arrow or Escape closes). The row's offset
 * while a finger moves it is the parent's draft from `Swiped`; this holds the
 * resting state and decides the end. The actions behind a closed row should be
 * `inert`, so Tab skips them: `data-swipe` is for the stylist, `inert` for the
 * browser, both from `open`.
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { Behaviors } from 'foldkit-mixins'

/** The side of the row its actions sit on: `start` is revealed by moving the row toward the end (right, in English). */
export const Side = Schema.Literals(['start', 'end'])
export type Side = typeof Side.Type

export const Model = Schema.Struct({
  open: Schema.OptionFromNullOr(Side),
})
export type Model = typeof Model.Type

/** What a release of the swipe measured, from a `SwipeEnded` and the row. */
const releaseFields = {
  deltaX: Schema.Number,
  velocityX: Schema.Number,
  /** The row's width, for the full swipe. */
  rowWidth: Schema.Number,
  /** How wide each side's actions are; 0 for a side with none. */
  startWidth: Schema.Number,
  endWidth: Schema.Number,
  rtl: Schema.Boolean,
}
export const Release = Schema.Struct(releaseFields)
export type Release = typeof Release.Type

export const Message = defineMessageUnion({
  Opened: { side: Side },
  Closed: {},
  /** The pointer let go: open, close or run the first action, by `decide`. */
  Released: releaseFields,
})
export type Message = typeof Message.Type

/** A swipe that ran past `fullSwipe` of the row: the parent runs that side's first action. */
export const FullSwiped = Schema.TaggedStruct('FullSwiped', { side: Side })
export type FullSwiped = typeof FullSwiped.Type

export const Args = Schema.Struct({
  /** How far across the row a swipe runs the first action, as a fraction of its width. */
  fullSwipe: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThan(0)),
    Schema.check(Schema.isLessThanOrEqualTo(1)),
  ),
  /** The speed, in pixels a millisecond, past which a release is a flick. */
  flick: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  /** Whether a side's first action may run from a long swipe; without it a long swipe only opens. */
  full: Schema.Boolean,
})
export type Args = typeof Args.Type

export type Decision =
  | { readonly _tag: 'Open'; readonly side: Side }
  | { readonly _tag: 'Close' }
  | { readonly _tag: 'Full'; readonly side: Side }

// The side a row moved by `x` shows: toward the end (right) is `start` in a left-to-right row.
const sideOf = (x: number, rtl: boolean): Side => (x > 0 !== rtl ? 'start' : 'end')

/**
 * What letting go means. The row stands where it rested (open on a side, or
 * closed) plus `deltaX`. A flick opens the side it points to, or closes the
 * row when it points back; otherwise past half of a side's actions opens it,
 * less closes, and past `fullSwipe` of the row runs its first action when `full`.
 * A side with no actions never opens.
 */
export const decide = (model: Model, release: Release, args: Args): Decision => {
  const widthOf = (side: Side): number => (side === 'start' ? release.startWidth : release.endWidth)
  // Which way a side's actions push the row: start to the right in left-to-right text.
  const sign = (side: Side): number => ((side === 'start') !== release.rtl ? 1 : -1)
  const rested = Option.match(model.open, {
    onNone: () => 0,
    onSome: side => sign(side) * widthOf(side),
  })
  const x = rested + release.deltaX
  const side = sideOf(x, release.rtl)
  const room = widthOf(side)
  if (x === 0 || room <= 0) return { _tag: 'Close' }
  if (args.full && Math.abs(x) >= args.fullSwipe * release.rowWidth) return { _tag: 'Full', side }
  if (Math.abs(release.velocityX) > args.flick) {
    return sideOf(release.velocityX, release.rtl) === side
      ? { _tag: 'Open', side }
      : { _tag: 'Close' }
  }
  return Math.abs(x) >= room / 2 ? { _tag: 'Open', side } : { _tag: 'Close' }
}

type Return = Update.ReturnWithOutMessage<Model, Message, FullSwiped>

const opened = (model: Model, side: Side): Model =>
  Option.contains(model.open, side) ? model : { open: Option.some(side) }

const closed = (model: Model): Model =>
  Option.isNone(model.open) ? model : { open: Option.none() }

export const bundle = Bundle.make('SwipeActions', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { open: Option.none() } }),
  update: (model, message, args): Return =>
    Message.match<Return>(message, {
      Opened: ({ side }) => ({ model: opened(model, side) }),
      Closed: () => ({ model: closed(model) }),
      Released: release => {
        return Match.valueTags(decide(model, release, args), {
          Open: ({ side }): Return => ({ model: opened(model, side) }),
          Close: (): Return => ({ model: closed(model) }),
          Full: ({ side }): Return => ({
            model: closed(model),
            outMessage: FullSwiped.make({ side }),
          }),
        })
      },
    }),
})

export interface KeyOptions<Input, ParentMessage> {
  /** Which side of the row is open now. */
  readonly open: (input: Input) => Option.Option<Side>
  /** Whether the row reads right to left, which swaps what each arrow reveals. */
  readonly rtl: boolean
  /** The placement's way to wrap a Message of this Bundle. */
  readonly toMessage: (message: Message) => ParentMessage
}

/**
 * The keyboard's swipe, as a `Behaviors.Keys` route for the row's keydown
 * owner: the arrow toward the end of the row reveals the `start` side's actions
 * (the other arrow, the `end` side's), the opposite arrow closes an open side,
 * and Escape closes. A press that would change nothing is declined, so Escape
 * on a closed row reaches whatever closes the page around it.
 */
export const keys = <Input, ParentMessage>(
  options: KeyOptions<Input, ParentMessage>,
): Behaviors.Keys.Route<Input, ParentMessage> =>
  Behaviors.Keys.route('SwipeActions', {
    on: [
      Behaviors.Keys.chord('ArrowRight'),
      Behaviors.Keys.chord('ArrowLeft'),
      Behaviors.Keys.chord('Escape'),
    ],
    handle: ({ key, input }) => {
      const open = options.open(input)
      if (key === 'Escape') {
        return Option.isSome(open)
          ? Option.some(options.toMessage(Message.Closed()))
          : Option.none()
      }
      // The arrow toward the end of the row moves it that way, revealing `start` in left-to-right text.
      const reveals = sideOf(key === 'ArrowRight' ? 1 : -1, options.rtl)
      return Option.match(open, {
        onNone: () => Option.some(options.toMessage(Message.Opened({ side: reveals }))),
        onSome: side =>
          side === reveals ? Option.none() : Option.some(options.toMessage(Message.Closed())),
      })
    },
  })
