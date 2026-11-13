/**
 * Rows and a popup that stay drawn while they leave. Each exit is a Presence
 * placement: `Hide` starts `hiding`, the view marks the part with `leaving(h)`
 * for that phase, and `Hidden` — ignored when a `Show` has since won — is what
 * drops the row. Focus, inert, and the outside set are the Leaving, FocusRecovery,
 * FocusScope, and HideOutside Mounts. Nothing here times an exit of its own.
 */
import { Effect, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Behavior, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'
import { FocusRecovery, FocusScope, Layers, Leaving } from 'foldkit-primitives/interaction'
import { isVisible, Presence, PresenceMessage } from 'foldkit-primitives/motion'

export const DURATION_MS = 400

export const Child = Schema.Struct({ id: Schema.String, label: Schema.String })
export const Tag = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  children: Schema.Array(Child),
})
export type Tag = typeof Tag.Type

const RowExit = Bundle.declare(Presence, 'rowExit')
const Popup = Bundle.declare(Presence, 'popup')

export const Model = Schema.Struct({
  scope: Schema.String,
  filter: Schema.String,
  tags: Schema.Array(Tag),
  closing: Schema.Option(Schema.String),
  ...RowExit.fields,
  ...Popup.fields,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...RowExit.cases,
  ...Popup.cases,
  Typed: { value: Schema.String },
  Dismissed: { id: Schema.String },
  Kept: {},
  RemovedChild: { id: Schema.String },
})
export type Message = typeof Message.Type

const Page = Bundle.parent({ Model, Message })
const args = { durationMs: DURATION_MS }

export const openPopup = Popup.wrapper.make(PresenceMessage.Show())
export const closePopup = Popup.wrapper.make(PresenceMessage.Hide())

const hideRow = {
  name: 'LeavingRow.hide',
  effect: Effect.succeed(RowExit.wrapper.make(PresenceMessage.Hide())),
}
const showRow = {
  name: 'LeavingRow.show',
  effect: Effect.succeed(RowExit.wrapper.make(PresenceMessage.Show())),
}

const assembly = Page.assemble(
  Page.at(RowExit, {
    args,
    onMessage: message => model =>
      PresenceMessage.match(message, {
        // A Show while a row is waiting (the exit slot was hidden) starts that
        // exit. Keep clears `closing` before its Show, so this does not re-hide it.
        Show: () => (Option.isNone(model.closing) ? { model } : { model, commands: [hideRow] }),
        Hide: () => ({ model }),
        Hidden: () => {
          // A Show that won leaves the phase shown, so a late Hidden cannot drop the row.
          if (model.rowExit.phase !== 'hidden') return { model }
          return Option.match(model.closing, {
            onNone: () => ({ model }),
            onSome: id => ({
              model: modifyFields(model, {
                tags: tags => tags.filter(tag => tag.id !== id),
                closing: () => Option.none(),
              }),
            }),
          })
        },
      }),
  }),
  Page.at(Popup, { args }),
)

const tags: ReadonlyArray<Tag> = [
  { id: 'design', label: 'design', children: [{ id: 'draft', label: 'draft' }] },
  { id: 'release', label: 'release', children: [] },
  { id: 'backlog', label: 'backlog', children: [] },
]

/**
 * `rowExit` starts shown: the rows are already on screen. A placement field
 * is not part of `initial`'s rest, so the shown phase is written over the
 * hidden seed its init returns. The popup stays shut.
 */
export const initialFor = (scope: string): { readonly model: Model } => {
  const seeded = assembly.initial({
    scope,
    filter: '',
    tags,
    closing: Option.none(),
  })
  return {
    model: { ...seeded.model, rowExit: { phase: 'shown' as const, generation: 1 } },
  }
}

export const initial = initialFor('main')

export const update = assembly.update((model, message) =>
  // A placement's wrapper is already folded; these arms keep that model.
  Message.match(message, {
    Typed: ({ value }) =>
      value === model.filter ? { model } : { model: modifyFields(model, { filter: () => value }) },
    Dismissed: ({ id }) => {
      if (
        Option.isSome(model.closing) ||
        model.rowExit.phase === 'hiding' ||
        !model.tags.some(tag => tag.id === id)
      ) {
        return { model }
      }
      // Hide from hidden does nothing, so a finished exit is shown again first.
      return {
        model: modifyFields(model, { closing: () => Option.some(id) }),
        commands: [model.rowExit.phase === 'hidden' ? showRow : hideRow],
      }
    },
    Kept: () =>
      model.rowExit.phase === 'hiding'
        ? {
            model: modifyFields(model, { closing: () => Option.none() }),
            commands: [showRow],
          }
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
    GotRowExitMessage: () => ({ model }),
    GotPopupMessage: () => ({ model }),
  }),
)

export const filterId = (scope: string) => `${scope}-filter:a [b]`
export const triggerId = (scope: string) => `${scope}-popup:trigger [x]`

export const PageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  filter: Slot.make({ capability: Capability.TextInput, events: [Event.Input] }),
  dismiss: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  keep: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  remove: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  open: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  panel: Slot.make({ capability: Capability.Container }),
  close: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

const View = SlotView.forMessages<Message>().define(PageSlots, (model: Model, slots, h) => {
  const closingId = Option.getOrUndefined(model.closing)
  return h.main(slots.root.attrs(), [
    h.input(
      slots.filter.attrs([
        h.Id(filterId(model.scope)),
        h.Value(model.filter),
        h.OnInput(value => Message.Typed({ value })),
        h.Placeholder('Filter tags'),
      ]),
    ),
    h.button(
      slots.open.attrs([h.Id(triggerId(model.scope)), h.Type('button'), h.OnClick(openPopup)]),
      ['Open popup'],
    ),
    ...(model.rowExit.phase === 'hiding'
      ? [h.button(slots.keep.attrs([h.Type('button'), h.OnClick(Message.Kept())]), ['Keep'])]
      : []),
    h.ul(
      [],
      model.tags.map((tag, index) =>
        h.li(
          [
            h.Key(tag.id),
            ...FocusRecovery.part(
              h,
              index === model.tags.length - 1 ? { to: filterId(model.scope) } : {},
            ),
            ...(model.rowExit.phase === 'hiding' && closingId === tag.id ? Leaving.leaving(h) : []),
          ],
          [
            h.span([], [tag.label]),
            h.button(
              slots.dismiss.attrs([h.Type('button'), h.OnClick(Message.Dismissed({ id: tag.id }))]),
              [`Remove ${tag.label}`],
            ),
            ...(tag.children.length === 0
              ? []
              : [
                  h.ul(
                    [],
                    tag.children.map(child =>
                      h.li(
                        [h.Key(child.id)],
                        [
                          h.span([], [child.label]),
                          h.button(
                            slots.remove.attrs([
                              h.Type('button'),
                              h.OnClick(Message.RemovedChild({ id: child.id })),
                            ]),
                            [`Remove ${child.label}`],
                          ),
                        ],
                      ),
                    ),
                  ),
                ]),
          ],
        ),
      ),
    ),
    ...(isVisible(model.popup)
      ? [
          h.div(
            slots.panel.attrs([
              ...FocusRecovery.part(h, { to: triggerId(model.scope) }),
              ...(model.popup.phase === 'hiding' ? Leaving.leaving(h) : []),
            ]),
            [
              h.button(slots.close.attrs([h.Type('button'), h.OnClick(closePopup)]), [
                'Close popup',
              ]),
              h.button([h.Type('button'), h.DataAttribute('popup-action', '')], ['Dialog action']),
            ],
          ),
        ]
      : []),
  ])
})

export const view = View.pipe(
  Behavior.attach(FocusRecovery.behavior(PageSlots)<Model, Message>({ container: 'root' })),
)
  .pipe(Behavior.attach(Leaving.behavior(PageSlots)<Model, Message>({ container: 'root' })))
  .pipe(
    Behavior.attach(
      FocusScope.behavior(PageSlots)<Model, Message>({
        container: 'panel',
        initialFocus: '[data-popup-action]',
      }),
    ),
  )
  .pipe(Behavior.attach(Layers.hideOutside(PageSlots)<Model, Message>({ container: 'panel' })))
