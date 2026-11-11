/// <reference types="@vitest/browser-playwright" />
/**
 * A `Crud.editor`'s form drawn in a real runtime, through its placement and
 * inside an `EditorView`: the `form` is `aria-busy` from the submit until
 * Remote has the save's answer, its button stays focusable and a press of it
 * meanwhile writes nothing, and a failed save is announced once.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { FormView } from 'foldkit-mixins-form'
import { Frames } from 'foldkit-mixins/testing'
import { Mutation, Remote, RemoteClient, RemoteMutationError } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { EditorView } from '../src/index.js'

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
const settled = NoteEditor.after(
  placements.update((model: Model, message: Message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)
const Shown = EditorView.forMessages<Message>().define()

/** The submits `update` was handed: evidence a press was handled, whatever it did. */
let submits = 0
const update = (model: Model, message: Message) => {
  if (message._tag === 'GotEditorMessage' && message.message._tag === 'Submitted') submits += 1
  return settled(model, message)
}

/** Lets the held save answer. */
let answer: () => void = () => {}
let saves = 0
const holding = Layer.succeed(RemoteClient, {
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
const failing = Layer.succeed(RemoteClient, {
  read: () => Effect.succeed({ settled: [], entities: [] }),
  query: () => Effect.die('no queries'),
  mutate: () =>
    Effect.suspend(() => {
      saves += 1
      return Effect.fail(new RemoteMutationError({ message: 'SchemaError: Expected string' }))
    }),
  live: () => Stream.empty,
})

afterEach(() => document.body.replaceChildren())

const mount = (client: Layer.Layer<RemoteClient>) => {
  saves = 0
  submits = 0
  const container = document.createElement('div')
  container.id = 'editor-busy'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => Placed.helpers.blank()(placements.initial({ remote: Remote.initial }).model),
      update,
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.main(
          [],
          [
            Shown(
              {
                id: 'note',
                status: NoteEditor.status(model),
                title: 'New note',
                form: Placed.view(model, h, { words: { submit: 'Save' } }),
              },
              h,
            ),
          ],
        ),
      resources: client,
    }),
  )
}

/** Runs `act` with every frame held, then lets them go: what it sent meets the page as last drawn. */
const beforeNextFrame = async (act: () => Promise<void>) => {
  const real = window.requestAnimationFrame
  const held: Array<FrameRequestCallback> = []
  window.requestAnimationFrame = callback => held.push(callback)
  try {
    await act()
  } finally {
    window.requestAnimationFrame = real
    held.forEach(callback => real.call(window, callback))
  }
}

const form = () => document.querySelector('form')!
const title = () => document.getElementById('SaveNote-title')!
const save = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]')!

test('the form is aria-busy until the save is answered, and keeps the focus a press gave it', async () => {
  const frames = Frames.track()
  const handle = mount(holding)
  try {
    await vi.waitFor(() => expect(title()).not.toBeNull())
    expect(form().getAttribute('aria-busy')).toBeNull()

    // Enter submits through the form's button, which still reads aria-disabled
    // in the page as drawn: the Enter meets `update`, which has the title, so
    // it saves.
    await beforeNextFrame(async () => {
      expect(save().getAttribute('aria-disabled')).toBe('true')
      await userEvent.fill(title(), 'Groceries')
      await userEvent.type(title(), '{Enter}')
    })
    await vi.waitFor(() => expect(form().getAttribute('aria-busy')).toBe('true'))
    expect(saves).toBe(1)
    expect([title(), save()]).toContain(document.activeElement)
    expect(save().getAttribute('aria-disabled')).toBe('true')

    // The button keeps the focus a keyboard gives it, and a press of it reaches
    // the editor, which writes nothing while the save is in flight.
    save().focus()
    expect(document.activeElement).toBe(save())
    await userEvent.type(save(), '{Enter}')
    await vi.waitFor(() => expect(submits).toBe(2))
    await frames.settle()
    expect(saves).toBe(1)
    expect(document.activeElement).toBe(save())

    answer()
    await vi.waitFor(() => expect(form().getAttribute('aria-busy')).toBeNull())
    await frames.settle()
    // The create landed, so its form starts blank again, with its own words,
    // and the button that cannot submit it yet keeps the focus.
    expect(title()).toHaveProperty('value', '')
    expect(save().textContent).toBe('Save')
    expect(saves).toBe(1)
    expect(document.activeElement).toBe(save())
    expect(save().disabled).toBe(false)
    expect(save().getAttribute('aria-disabled')).toBe('true')

    // A press says what the blank form lacks, and writes nothing.
    await userEvent.type(save(), '{Enter}')
    await vi.waitFor(() => expect(submits).toBe(3))
    await frames.settle()
    expect(saves).toBe(1)
    expect(document.activeElement).toBe(save())

    // An edit ends it: the form is the author's again, and drawn by its own rule.
    await userEvent.fill(title(), 'Milk')
    await frames.settle()
    expect(save().getAttribute('aria-disabled')).toBeNull()
    await userEvent.fill(title(), '')
    await frames.settle()
    expect(save().getAttribute('aria-disabled')).toBe('true')
    expect(save().disabled).toBe(false)
  } finally {
    handle.dispose()
    frames.dispose()
  }
})

test('a failed save is announced once, in the form, in words for a reader', async () => {
  const frames = Frames.track()
  const handle = mount(failing)
  try {
    await vi.waitFor(() => expect(title()).not.toBeNull())
    await userEvent.fill(title(), 'Groceries')
    await userEvent.click(save())
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull())
    await frames.settle()
    const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
    expect(alerts.map(alert => alert.textContent)).toEqual([
      'Could not save. Check your connection and try again.',
    ])
    expect(form().contains(alerts[0]!)).toBe(true)
    expect(save().textContent).toBe('Try again')
  } finally {
    handle.dispose()
    frames.dispose()
  }
})
