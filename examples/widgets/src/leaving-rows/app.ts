/**
 * Rows that stay drawn while they leave, any number at once. Each row has a
 * `Presence` of its own in a collection keyed by the row's id: dismissing a
 * row hides its presence, `Keep` shows it again, and the row is dropped when
 * its own `Hidden` lands with the presence still hidden. A `Show` that won in
 * between leaves the phase shown, so that late `Hidden` drops nothing. The
 * popup is one more placement. The exits are timed by `Presence` alone.
 */
import { Option, Record, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Presence, PresenceMessage, type PresenceModel } from 'foldkit-primitives/motion'

export const DURATION_MS = 400

export const Child = Schema.Struct({ id: Schema.String, label: Schema.String })
export const Tag = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  children: Schema.Array(Child),
})
export type Tag = typeof Tag.Type

const Exits = Bundle.declareEach(Presence, 'exits')
const Popup = Bundle.declare(Presence, 'popup')

export const Model = Schema.Struct({
  scope: Schema.String,
  filter: Schema.String,
  tags: Schema.Array(Tag),
  ...Exits.fields,
  ...Popup.fields,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Exits.cases,
  ...Popup.cases,
  Typed: { value: Schema.String },
  Dismissed: { id: Schema.String },
  Kept: { id: Schema.String },
  RemovedChild: { id: Schema.String },
})
export type Message = typeof Message.Type

const Page = Bundle.parent({ Model, Message })
const args = { durationMs: DURATION_MS }

export const openPopup = Popup.wrapper.make(PresenceMessage.Show())
export const closePopup = Popup.wrapper.make(PresenceMessage.Hide())

const exits = Page.each(Exits, {
  args,
  // The row goes when its own exit ends: a `Show` since then leaves the
  // phase shown, so a late `Hidden` finds nothing to drop.
  onMessage: (message, id) => model =>
    PresenceMessage.match(message, {
      Show: () => ({ model }),
      Hide: () => ({ model }),
      Hidden: () =>
        model.exits[id]?.phase === 'hidden'
          ? {
              model: modifyFields(model, {
                tags: tags => tags.filter(tag => tag.id !== id),
                exits: current => Record.remove(current, id),
              }),
            }
          : { model },
    }),
})

const assembly = Page.assemble(exits, Page.at(Popup, { args }))

const tags: ReadonlyArray<Tag> = [
  { id: 'design', label: 'design', children: [{ id: 'draft', label: 'draft' }] },
  { id: 'release', label: 'release', children: [] },
  { id: 'backlog', label: 'backlog', children: [] },
]

const shown: PresenceModel = { phase: 'shown', generation: 1 }

/** Every row starts shown, since it is already on screen; the popup stays shut. */
export const initialFor = (scope: string): { readonly model: Model } =>
  assembly.initial({
    scope,
    filter: '',
    tags,
    exits: Object.fromEntries(tags.map(tag => [tag.id, shown])),
  })

export const initial = initialFor('main')

/** Whether the row is still drawn only for its exit. */
export const isLeaving = (model: Model, id: string): boolean => model.exits[id]?.phase === 'hiding'

export const update = assembly.update((model, message) =>
  // A placement's wrapper is already folded; these arms keep that model.
  Message.match(message, {
    Typed: ({ value }) =>
      value === model.filter ? { model } : { model: modifyFields(model, { filter: () => value }) },
    // Each row answers for its own presence: another row's exit does not stop this one.
    Dismissed: ({ id }) =>
      model.exits[id]?.phase === 'shown'
        ? Option.getOrElse(
            exits.update(model, Exits.wrapper.make(id, PresenceMessage.Hide())),
            () => ({ model }),
          )
        : { model },
    Kept: ({ id }) =>
      model.exits[id]?.phase === 'hiding'
        ? Option.getOrElse(
            exits.update(model, Exits.wrapper.make(id, PresenceMessage.Show())),
            () => ({ model }),
          )
        : { model },
    RemovedChild: ({ id }) =>
      model.tags.some(tag => tag.children.some(child => child.id === id))
        ? {
            model: modifyFields(model, {
              tags: tags =>
                tags.map(tag => ({
                  ...tag,
                  children: tag.children.filter(child => child.id !== id),
                })),
            }),
          }
        : { model },
    GotExitsMessage: () => ({ model }),
    GotPopupMessage: () => ({ model }),
  }),
)

export const filterId = (scope: string) => `${scope}-filter:a [b]`
export const triggerId = (scope: string) => `${scope}-popup:trigger [x]`
