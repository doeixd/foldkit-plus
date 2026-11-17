/**
 * An editable, dismissible, reorderable list. The Model owns the items; four
 * placements own what each primitive keeps: a `Presence` per row (a dismissed
 * row leaves over a duration, out of reach), one `Reorder` (what is held and
 * where it would land), and a `LiveAnnounce`. A dismissed row is removed from
 * the items when its `Presence` says `Hidden`; a move is applied when `Reorder`
 * says `Moved`. Neither writes the other's field.
 */
import { Effect, Match, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle, Link } from 'foldkit-bundle'
import { LiveAnnounce, Presence, Reorder } from 'foldkit-primitives/interaction'
import { PresenceMessage } from 'foldkit-primitives/motion'

export const DURATION_MS = 200

/** A flat row; `parent` names the row that holds it, which a dismissed child's focus falls back to. */
export const Item = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  parent: Schema.Option(Schema.String),
})
export type Item = typeof Item.Type

export const Rows = Bundle.declare(Reorder.bundle, 'rows')
export const Live = Bundle.declare(LiveAnnounce.bundle, 'live')
export const GotPresence = Link.keyedWrapper('GotPresence', PresenceMessage)

export const Model = Schema.Struct({
  ...Rows.fields,
  ...Live.fields,
  id: Schema.String,
  items: Schema.Array(Item),
  presence: Schema.Record(Schema.String, Presence.bundle.Model),
  editing: Schema.Option(Schema.String),
  draft: Schema.String,
  added: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Rows.cases,
  ...Live.cases,
  ...GotPresence.cases,
  Added: {},
  Dismissed: { id: Schema.String },
  StartedEdit: { id: Schema.String },
  Drafted: { text: Schema.String },
  Committed: {},
  Cancelled: {},
  CompletedFocus: {},
})
export type Message = typeof Message.Type

/**
 * The element id of an item's edit button, which takes focus back when its editor closes.
 * Every id starts with the list's own, so two lists on one page share none.
 */
export const editId = (list: string, id: string): string => `${list}:${id}:edit`
export const editorId = (list: string, id: string): string => `${list}:${id}:editor`

const FocusById = Command.define('FocusById', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ id }) =>
    Dom.focus(`[id="${CSS.escape(id)}"]`).pipe(Effect.ignore, Effect.as(Message.CompletedFocus())),
})

const shown = { phase: 'shown', generation: 0 } as const

/** A row's phase; a row drawn with no placement is a defect, not a phase to guess. */
export const phaseOf = (model: Pick<Model, 'presence'>, id: string): Presence.Phase => {
  if (!Object.hasOwn(model.presence, id))
    throw new Error(`row ${id} is drawn with no Presence placed`)
  return model.presence[id]!.phase
}

const titleOf = (model: Model, id: string): string =>
  model.items.find(item => item.id === id)?.title ?? id

const Page = Bundle.parent({ Model, Message })
const Announcer = Page.at(Live, { args: { debounceMs: 0, clearAfterMs: 5000 } })

const Presences = Presence.bundle.each(Link.collection<Model>()('presence', GotPresence), {
  args: { durationMs: DURATION_MS },
  // Removal is the view ceasing to draw the row: the placement decided it is `hidden`.
  onMessage: (_message: PresenceMessage, id: string) => (model: Model) =>
    Object.hasOwn(model.presence, id) && model.presence[id]?.phase === 'hidden'
      ? {
          model: modifyFields(model, {
            items: items => items.filter(item => item.id !== id),
            presence: presence =>
              Object.fromEntries(Object.entries(presence).filter(([key]) => key !== id)),
          }),
        }
      : { model },
})

const Reordered = Page.at(Rows, {
  onOut: (fact: Reorder.OutMessage) => (model: Model) => {
    const moved = Reorder.OutMessage.match(fact, {
      Moved: move =>
        modifyFields(model, {
          items: items => {
            const before = items.map(item => item.id)
            const after = Reorder.apply(before, move)
            return after === before ? items : after.map(id => items.find(item => item.id === id)!)
          },
        }),
      PickedUp: () => model,
      PassedOver: () => model,
      PutBack: () => model,
    })
    return Announcer.helpers.announce(
      Reorder.announcement(fact, { label: id => titleOf(model, id) }),
    )(moved)
  },
})

export const placements = Bundle.assemble<Model, Message>()([Announcer, Reordered, Presences])

const ITEMS: ReadonlyArray<Item> = [
  { id: 'item-1', title: 'Write the guide', parent: Option.none() },
  { id: 'item-2', title: 'Review the pull request', parent: Option.none() },
  { id: 'item-3', title: 'Ship it', parent: Option.none() },
]

export const initial = (
  options: { readonly id?: string; readonly items?: ReadonlyArray<Item> } = {},
): { readonly model: Model } => {
  const items = options.items ?? ITEMS
  const { model } = placements.initial({
    id: options.id ?? 'list',
    items,
    presence: Object.fromEntries(items.map(item => [item.id, shown])),
    editing: Option.none(),
    draft: '',
    added: 0,
  })
  return { model }
}

export const update = placements.update((model, message) =>
  Match.valueTags(message, {
    Added: () => {
      const id = `new-${model.added + 1}`
      return {
        model: modifyFields(model, {
          items: items => [
            ...items,
            { id, title: `New item ${model.added + 1}`, parent: Option.none() },
          ],
          presence: presence => ({ ...presence, [id]: shown }),
          added: count => count + 1,
        }),
      }
    },
    Dismissed: ({ id }) => Presences.helpers.hide(id)(model),
    StartedEdit: ({ id }) => ({
      model: modifyFields(model, {
        editing: () => Option.some(id),
        draft: () => titleOf(model, id),
      }),
      commands: [FocusById({ id: editorId(model.id, id) })],
    }),
    Drafted: ({ text }) => ({ model: modifyFields(model, { draft: () => text }) }),
    Committed: () =>
      Option.match(model.editing, {
        onNone: () => ({ model }),
        onSome: id => ({
          model: modifyFields(model, {
            editing: () => Option.none(),
            items: items =>
              model.draft.trim() === ''
                ? items
                : items.map(item =>
                    item.id === id ? { ...item, title: model.draft.trim() } : item,
                  ),
          }),
          commands: [FocusById({ id: editId(model.id, id) })],
        }),
      }),
    Cancelled: () =>
      Option.match(model.editing, {
        onNone: () => ({ model }),
        onSome: id => ({
          model: modifyFields(model, { editing: () => Option.none() }),
          commands: [FocusById({ id: editId(model.id, id) })],
        }),
      }),
    CompletedFocus: () => ({ model }),
  }),
)
