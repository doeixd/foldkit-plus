/**
 * A message row with actions behind it. `SwipeActions` keeps which side is
 * open and decides what a release means; the Model keeps the row's width (from
 * where a swipe starts), the draft offset while a finger moves it, and which
 * action ran last. Pin sits on the start side, Archive and Delete on the end
 * side; a long swipe runs a side's first action. The keyboard reaches the same
 * Messages through `SwipeActions.keys`, and the same `Acted` fires from a press
 * on an action however the row was opened.
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { SwipeActions } from 'foldkit-primitives/interaction'

export const ACTIONS = ['pin', 'archive', 'delete'] as const
export const Action = Schema.Literals(ACTIONS)
export type Action = typeof Action.Type

/** The actions behind each side of the row, first to last. A long swipe runs the first. */
export const actionsOn = (side: SwipeActions.Side): ReadonlyArray<Action> =>
  side === 'start' ? ['pin'] : ['archive', 'delete']

/** How much of the row's width each side's actions take, for the view and for the release's arithmetic. */
export const ACTION_SHARE = 0.3

export const swipeArgs = { fullSwipe: 0.75, flick: 0.4, full: true } as const

export const Row = Bundle.declare(SwipeActions.bundle, 'row')

export const Model = Schema.Struct({
  ...Row.fields,
  /** The row's width, known once a swipe has started. */
  width: Schema.OptionFromNullOr(Schema.Number),
  /** Where a finger holds the row, from its resting place, in pixels. */
  offset: Schema.OptionFromNullOr(Schema.Number),
  done: Schema.OptionFromNullOr(Action),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Row.cases,
  Grabbed: { width: Schema.Number },
  Dragged: { deltaX: Schema.Number },
  LetGo: { deltaX: Schema.Number, velocityX: Schema.Number, completed: Schema.Boolean },
  Acted: { action: Action },
  /** Focus left the row and its actions: the actions are put away. */
  FocusLeft: {},
})
export type Message = typeof Message.Type

/** Where the open side leaves the row, in pixels: toward the end for `start`. */
const restedAt = (open: Option.Option<SwipeActions.Side>, width: number): number =>
  Option.match(open, {
    onNone: () => 0,
    onSome: side => (side === 'start' ? 1 : -1) * ACTION_SHARE * width,
  })

const Parent = Bundle.parent({ Model, Message })

const Swiping = Parent.at(Row, {
  args: swipeArgs,
  onOut: (fact: SwipeActions.FullSwiped) => (model: Model) => ({
    model: modifyFields(model, { done: () => Option.some(actionsOn(fact.side)[0]!) }),
  }),
})

export const assembly = Parent.assemble(Swiping)

export const initial = () =>
  assembly.initial({ width: Option.none(), offset: Option.none(), done: Option.none() })

const closeRow = (model: Model) =>
  Option.getOrElse(Swiping.update(model, Row.wrapper.make(SwipeActions.Message.Closed())), () => ({
    model,
  }))

export const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    Grabbed: ({ width }) => ({
      model: modifyFields(model, { width: () => Option.some(width), done: () => Option.none() }),
    }),
    Dragged: ({ deltaX }) =>
      Option.match(model.width, {
        onNone: () => ({ model }),
        onSome: width => ({
          model: modifyFields(model, {
            offset: () => Option.some(restedAt(model.row.open, width) + deltaX),
          }),
        }),
      }),
    LetGo: ({ deltaX, velocityX, completed }) => {
      const dropped = modifyFields(model, { offset: () => Option.none() })
      // A cancelled swipe leaves the row where it rested.
      if (!completed) return { model: dropped }
      return Option.match(dropped.width, {
        onNone: () => ({ model: dropped }),
        onSome: width =>
          Option.getOrElse(
            Swiping.update(
              dropped,
              Row.wrapper.make(
                SwipeActions.Message.Released({
                  deltaX,
                  velocityX,
                  rowWidth: width,
                  startWidth: ACTION_SHARE * width,
                  endWidth: ACTION_SHARE * width,
                  rtl: false,
                }),
              ),
            ),
            () => ({ model: dropped }),
          ),
      })
    },
    Acted: ({ action }) => closeRow(modifyFields(model, { done: () => Option.some(action) })),
    FocusLeft: () => (Option.isNone(model.row.open) ? { model } : closeRow(model)),
  }),
)
