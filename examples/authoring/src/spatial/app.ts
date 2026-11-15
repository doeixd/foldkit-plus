/**
 * Freely placed cards that are selected two ways, into one `Selection`. The
 * arrows (`SpatialNavigation`) walk to the nearest card and Space presses it;
 * a lasso (`Marquee`) over empty space replaces the selection with the cards
 * it touches. Neither path knows the other: both end in `picks`, and the one
 * announcement ("3 selected") is made from that state, whichever wrote it.
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { LiveAnnounce, Marquee, Selection, SpatialNavigation } from 'foldkit-primitives/interaction'

export const Card = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
})
export type Card = typeof Card.Type

export const Nav = Bundle.declare(SpatialNavigation.bundle, 'nav')
export const Picks = Bundle.declare(Selection.bundle, 'picks')
export const Live = Bundle.declare(LiveAnnounce.bundle, 'live')

export const navArgs = { id: 'cards' } as const
export const pickArgs = { mode: 'multiple', allowEmpty: true } as const

/** The lasso being dragged: its rectangle, and what was selected when it began, which a Shift lasso keeps. */
export const Lasso = Schema.Struct({
  rect: Marquee.MarqueeRect,
  before: Schema.Array(Schema.String),
})
export type Lasso = typeof Lasso.Type

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Picks.fields,
  ...Live.fields,
  cards: Schema.Array(Card),
  lasso: Schema.Option(Lasso),
  /** How many cards were last announced, so an unchanged count is not read again. */
  told: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Picks.cases,
  ...Live.cases,
  LassoStarted: { additive: Schema.Boolean },
  LassoChanged: {
    rect: Marquee.MarqueeRect,
    ids: Schema.Array(Schema.String),
    additive: Schema.Boolean,
  },
  LassoEnded: { ids: Schema.Array(Schema.String), additive: Schema.Boolean },
  LassoCancelled: {},
  ClearedSelection: {},
})
export type Message = typeof Message.Type

/** The text read for a selection of `count` cards. */
export const announcementOf = (count: number): string =>
  count === 0 ? 'Nothing selected' : `${count} selected`

const Parent = Bundle.parent({ Model, Message })
const Announcer = Parent.at(Live, { args: { debounceMs: 150, clearAfterMs: 5000 } })
const Navigation = Parent.at(Nav, { args: navArgs })

/** Reads the selection's size out when it is not the one last read. */
const announced: Update.Step<Model, Message> = model =>
  model.picks.selected.length === model.told
    ? { model }
    : Announcer.helpers.announce(announcementOf(model.picks.selected.length))(
        modifyFields(model, { told: () => model.picks.selected.length }),
      )

// A click reaches `picks` as a Selection Message and a lasso through its helper, which
// `onMessage` does not see: each path ends in `announced`.
const Selected = Parent.at(Picks, { args: pickArgs, onMessage: () => announced })

export const assembly = Parent.assemble(Navigation, Selected, Announcer)

/** The board's size in pixels, in the units the cards' places are in. */
export const BOARD = { width: 440, height: 240 } as const

/** Cards at places no row or column fits. */
export const CARDS: ReadonlyArray<Card> = [
  { id: 'a', label: 'Alpha', x: 20, y: 20, width: 100, height: 60 },
  { id: 'b', label: 'Bravo', x: 180, y: 10, width: 80, height: 80 },
  { id: 'c', label: 'Charlie', x: 300, y: 50, width: 90, height: 50 },
  { id: 'd', label: 'Delta', x: 60, y: 130, width: 70, height: 70 },
  { id: 'e', label: 'Echo', x: 210, y: 150, width: 110, height: 60 },
  { id: 'f', label: 'Foxtrot', x: 350, y: 140, width: 60, height: 80 },
]

export const initial = () => assembly.initial({ cards: CARDS, lasso: Option.none(), told: 0 })

const none: Marquee.MarqueeRect = { x: 0, y: 0, width: 0, height: 0 }

const selectWith = (model: Model, ids: ReadonlyArray<string>, lasso: Option.Option<Lasso>) =>
  Update.combine(modifyFields(model, { lasso: () => lasso }), [
    Selected.helpers.replace(ids),
    announced,
  ])

export const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    LassoStarted: () => ({
      model: modifyFields(model, {
        lasso: () => Option.some({ rect: none, before: model.picks.selected }),
      }),
    }),
    LassoChanged: ({ rect, ids, additive }) =>
      Option.match(model.lasso, {
        onNone: () => ({ model }),
        onSome: lasso =>
          selectWith(
            model,
            Marquee.selected(lasso.before, { ids, additive }),
            Option.some({ ...lasso, rect }),
          ),
      }),
    LassoEnded: ({ ids, additive }) =>
      Option.match(model.lasso, {
        onNone: () => ({ model }),
        onSome: lasso =>
          selectWith(model, Marquee.selected(lasso.before, { ids, additive }), Option.none()),
      }),
    // Escape mid-drag puts back what was selected before the drag.
    LassoCancelled: () =>
      Option.match(model.lasso, {
        onNone: () => ({ model }),
        onSome: lasso => selectWith(model, lasso.before, Option.none()),
      }),
    ClearedSelection: () => Update.combine(model, [Selected.helpers.clear(), announced]),
  }),
)
