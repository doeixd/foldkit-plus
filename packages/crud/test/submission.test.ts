/**
 * An editor's form is busy from submit until Remote has the save's answer, and
 * reads it from the ledger by the save's request id: nothing is kept beside it.
 * A refused save lands on the field it names, or on the form; a failed one
 * offers the same write again.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import { Mutation, Refusal, Remote, RemoteClient, RemoteMutationError } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { Command } from 'foldkit/command'
import { beforeEach, describe, expect, it } from 'vitest'
import { Crud, type SubmitInputs } from '../src/index.js'

const Note = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, title: Schema.String.check(Schema.isMinLength(1)) }),
)
const EditNoteInput = Entity.input(
  Note,
  Schema.Struct({ id: Schema.String, title: Note.fields.title.schema }),
)
const EditNote = Mutation.make('EditNote', {
  Input: EditNoteInput.schema,
  Output: { id: Schema.String },
  Refusal: Schema.Union([Refusal.field('title', Schema.String), Refusal.invalid, Refusal.conflict]),
})
const EditNoteForm = Form.make('EditNote', EditNoteInput, {
  inputs: { id: Input.hidden() },
  debounce: 0,
})
// The page words one kind of failure; the others keep the editor's own.
const Editor = Crud.editor('NoteEditor', {
  form: EditNoteForm,
  mutation: EditNote,
  words: { refused: 'Notes like this cannot be saved.' },
})
const Slot = Bundle.declare(Editor.bundle, 'editor')

const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, ...Slot.cases })
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Note], mutations: [EditNote] })
const NoteEditor = Editor.at({ data: Data, model: App.model.editor })
const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, NoteEditor.placement)
const update = NoteEditor.after(
  Page.assemble(Placed).update((model: Model, message: Message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)

/** What the server does with the next save. */
type Answer =
  | { readonly _tag: 'Apply' }
  | { readonly _tag: 'Refuse'; readonly refusal: unknown }
  | { readonly _tag: 'Fail' }
let answers: Array<Answer> = []
/** The saves the server was sent, each with its request and operation ids. */
let sent: Array<{
  readonly requestId: string
  readonly operation?: string | undefined
  readonly input: unknown
}> = []
const Client = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.succeed({
      settled: [],
      entities: batch.requests.map(request => ({
        entity: 'Note',
        id: request.id,
        values: { id: request.id, title: 'Draft' },
      })),
    }),
  query: () => Effect.die('no queries'),
  mutate: request => {
    sent.push(request)
    const answer = answers.shift() ?? { _tag: 'Apply' }
    const input = request.input as typeof EditNoteInput.schema.Encoded
    switch (answer._tag) {
      case 'Apply':
        return Effect.succeed({
          output: { id: input.id },
          entities: [{ entity: 'Note', id: input.id, values: input }],
        })
      case 'Refuse':
        return Effect.fail(new RemoteMutationError({ message: 'refused', refusal: answer.refusal }))
      case 'Fail':
        // What a transport says is for diagnostics, not for the reader.
        return Effect.fail(new RemoteMutationError({ message: 'SchemaError: Expected string' }))
    }
  },
  live: () => Stream.empty,
})

beforeEach(() => {
  answers = []
  sent = []
})

/** One Message through `update`, its Commands held, as a runtime has them before they run. */
const step = (model: Model, message: Message) => update(model, message)
const typed = (model: Model, title: string) =>
  step(
    model,
    Message.GotEditorMessage({
      message: EditNoteForm.Message.Changed({ key: 'title', value: title }),
    }),
  ).model
const submit = (model: Model) =>
  step(model, Message.GotEditorMessage({ message: EditNoteForm.Message.Submitted() }))
/** Runs a held save, and hands its answer to `update`. */
const answer = async (
  model: Model,
  command: Command<Message, never, RemoteClient>,
): Promise<Model> => {
  const settled = await Effect.runPromise(command.effect.pipe(Effect.provide(Client)))
  return step(model, settled).model
}

/** The editor opened on n1, loaded and filled. */
const opened = async (): Promise<Model> => {
  const open = Placed.helpers.open('n1')(
    Page.assemble(Placed).initial({ remote: Remote.initial }).model,
  ).model
  const projection = Option.getOrThrow(NoteEditor.active.projectionOf(open))
  const loaded = await Effect.runPromise(
    Data.prefetch(open, projection).pipe(Effect.provide(Client)),
  )
  return NoteEditor.sync(loaded).model
}

/** What the form's view is drawn with, given nothing of its own. */
const inputs = (model: Model): SubmitInputs => NoteEditor.placement.viewInputs(model, {})

describe('An editor’s submission', () => {
  it('is busy from submit until the answer, and not after', async () => {
    const ready = typed(await opened(), 'Revised')
    expect(NoteEditor.busy(ready)).toBe(false)
    expect(inputs(ready)).toEqual({ submitting: false, failure: undefined })

    const submitted = submit(ready)
    expect(NoteEditor.busy(submitted.model)).toBe(true)
    expect(inputs(submitted.model).submitting).toBe(true)

    const saved = await answer(submitted.model, submitted.commands![0]!)
    expect(NoteEditor.busy(saved)).toBe(false)
    expect(inputs(saved)).toEqual({ submitting: false, failure: undefined })
    expect(NoteEditor.status(saved)).toBe('Saved')
  })

  it('does nothing when submitted again while busy: no second write, the Model unchanged', async () => {
    const first = submit(typed(await opened(), 'Revised'))
    const again = submit(first.model)
    expect(again.model).toBe(first.model)
    expect(again.commands ?? []).toEqual([])

    await answer(first.model, first.commands![0]!)
    expect(sent).toHaveLength(1)
  })

  it('keeps a busy flag and a failure the page gives, over its own', async () => {
    const ready = await opened()
    expect(NoteEditor.placement.viewInputs(ready, { submitting: true }).submitting).toBe(true)
    answers = [{ _tag: 'Fail' }]
    const submitted = submit(typed(ready, 'Revised'))
    const failed = await answer(submitted.model, submitted.commands![0]!)
    const failure = { error: 'Saved for later, once you are online.', retry: true }
    expect(NoteEditor.placement.viewInputs(failed, { failure }).failure).toBe(failure)
  })

  it('shows a refusal of a field on that field, and nothing on the form', async () => {
    answers = [{ _tag: 'Refuse', refusal: { _tag: 'Field', key: 'title', reason: 'Taken' } }]
    const submitted = submit(typed(await opened(), 'Revised'))
    const refused = await answer(submitted.model, submitted.commands![0]!)

    expect(NoteEditor.busy(refused)).toBe(false)
    expect(EditNoteForm.field(refused.editor.form, 'title')).toMatchObject({
      _tag: 'Invalid',
      errors: ['Taken'],
    })
    expect(inputs(refused).failure).toBeUndefined()
  })

  it('shows a refusal naming no field on the form, and does not offer it again', async () => {
    answers = [
      {
        _tag: 'Refuse',
        refusal: {
          _tag: 'Invalid',
          entity: 'Note',
          rule: 'archived',
          message: 'An archived note cannot be renamed',
          path: ['archived'],
        },
      },
    ]
    const submitted = submit(typed(await opened(), 'Revised'))
    const refused = await answer(submitted.model, submitted.commands![0]!)

    expect(inputs(refused).failure).toEqual({
      error: 'An archived note cannot be renamed',
      retry: false,
    })
    expect(EditNoteForm.field(refused.editor.form, 'title')._tag).toBe('Valid')
    // A conflict names no field either, and says the editor's words for it.
    answers = [{ _tag: 'Refuse', refusal: { _tag: 'Conflict' } }]
    const again = submit(refused)
    const conflicted = await answer(again.model, again.commands![0]!)
    expect(inputs(conflicted).failure).toEqual({
      error: 'Someone else saved this first, so your changes were not saved.',
      retry: false,
    })
    // A refusal the mutation does not declare says the page's words for a refusal.
    answers = [{ _tag: 'Refuse', refusal: { _tag: 'Field', key: 'slug', reason: 'Taken' } }]
    const third = submit(conflicted)
    const undeclared = await answer(third.model, third.commands![0]!)
    expect(inputs(undeclared).failure).toEqual({
      error: 'Notes like this cannot be saved.',
      retry: false,
    })
    // A refusal is not sent again as itself: each was a write of its own.
    expect(new Set(sent.map(request => request.requestId)).size).toBe(3)
  })

  it('offers a failed save again, sends it as itself, and is busy until it lands', async () => {
    answers = [{ _tag: 'Fail' }]
    const submitted = submit(typed(await opened(), 'Revised'))
    const failed = await answer(submitted.model, submitted.commands![0]!)
    expect(NoteEditor.busy(failed)).toBe(false)
    expect(inputs(failed).failure).toEqual({
      error: 'Could not save. Check your connection and try again.',
      retry: true,
    })
    expect(NoteEditor.saveError(failed)?.message).toBe('SchemaError: Expected string')

    const retried = submit(failed)
    expect(NoteEditor.busy(retried.model)).toBe(true)
    expect(inputs(retried.model).failure).toBeUndefined()
    const saved = await answer(retried.model, retried.commands![0]!)

    expect(NoteEditor.status(saved)).toBe('Saved')
    expect(inputs(saved)).toEqual({ submitting: false, failure: undefined })
    // The same write: one request id, one operation id, so the server can tell.
    expect(sent).toHaveLength(2)
    expect(sent[1]!.requestId).toBe(sent[0]!.requestId)
    expect(sent[1]!.operation).toBeDefined()
    expect(sent[1]!.operation).toBe(sent[0]!.operation)
  })

  it('sends a new write, not the failed one, once the form was edited since', async () => {
    answers = [{ _tag: 'Fail' }]
    const submitted = submit(typed(await opened(), 'Revised'))
    const failed = await answer(submitted.model, submitted.commands![0]!)
    const edited = typed(failed, 'Revised again')
    expect(inputs(edited).failure).toBeUndefined()

    const resent = submit(edited)
    await answer(resent.model, resent.commands![0]!)
    expect(sent[1]!.requestId).not.toBe(sent[0]!.requestId)
    expect(sent[1]!.input).toEqual({ id: 'n1', title: 'Revised again' })
  })
})
