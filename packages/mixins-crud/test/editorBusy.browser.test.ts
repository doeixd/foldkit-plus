/// <reference types="@vitest/browser-playwright" />
/**
 * A `Crud.editor`'s form drawn in a real runtime, through its placement: the
 * `form` is `aria-busy` from the submit until Remote has the save's answer,
 * and not after, with no flag of the page's own.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { FormView } from 'foldkit-mixins-form'
import { Mutation, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

const Note = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, title: Schema.String.check(Schema.isMinLength(1)) }),
)
const SaveNoteInput = Entity.input(
  Note,
  Schema.Struct({ id: Schema.OptionFromNullOr(Schema.String), title: Note.fields.title.schema }),
)
const SaveNote = Mutation.make('SaveNote', {
  Input: SaveNoteInput.schema,
  Output: { id: Schema.String },
})
const SaveNoteForm = Form.make('SaveNote', SaveNoteInput, {
  inputs: { id: Input.hidden() },
  debounce: 0,
})
const Editor = Crud.editor('NoteEditor', { form: SaveNoteForm, mutation: SaveNote })
const Slot = Bundle.declare(
  Editor.bundle.pipe(
    Bundle.withView(
      Crud.editorView(FormView.submodel(SaveNoteForm, FormView.define(SaveNoteForm))),
    ),
  ),
  'editor',
)

const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, ...Slot.cases })
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Note], mutations: [SaveNote] })
const NoteEditor = Editor.at({ data: Data, model: App.model.editor })
const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, NoteEditor.placement)
const placements = Page.assemble(Placed)
const update = NoteEditor.after(
  placements.update((model: Model, message: Message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)

/** Lets the held save answer. */
let answer: () => void = () => {}
let saves = 0
const client = Layer.succeed(RemoteClient, {
  read: () => Effect.succeed({ settled: [], entities: [] }),
  query: () => Effect.die('no queries'),
  mutate: request =>
    Effect.callback<void>(resume => {
      saves += 1
      answer = () => resume(Effect.void)
    }).pipe(
      Effect.as({
        output: { id: 'n1' },
        entities: [
          {
            entity: 'Note',
            id: 'n1',
            values: { id: 'n1', title: (request.input as { readonly title: string }).title },
          },
        ],
      }),
    ),
  live: () => Stream.empty,
})

afterEach(() => document.body.replaceChildren())

const form = () => document.querySelector('form')!
const save = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]')!

test('the drawn form is aria-busy from submit until the save is answered', async () => {
  saves = 0
  const container = document.createElement('div')
  container.id = 'editor-busy'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => Placed.helpers.blank()(placements.initial({ remote: Remote.initial }).model),
      update,
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.main([], [Placed.view(model, h, { words: { submit: 'Save' } })]),
      resources: client,
    }),
  )
  try {
    await vi.waitFor(() => expect(document.getElementById('SaveNote-title')).not.toBeNull())
    await userEvent.fill(document.getElementById('SaveNote-title')!, 'Groceries')
    expect(form().getAttribute('aria-busy')).toBeNull()

    await userEvent.click(save())
    await vi.waitFor(() => expect(form().getAttribute('aria-busy')).toBe('true'))
    expect(save().disabled).toBe(true)
    // Enter in the field submits nothing more while the save is in flight.
    await userEvent.type(document.getElementById('SaveNote-title')!, '{Enter}')
    expect(saves).toBe(1)

    answer()
    await vi.waitFor(() => expect(form().getAttribute('aria-busy')).toBeNull())
    // The create landed, so its form starts blank again, with its own words.
    expect(save().textContent).toBe('Save')
    expect(saves).toBe(1)
  } finally {
    handle.dispose()
  }
})
